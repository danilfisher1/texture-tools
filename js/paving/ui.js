// Вкладка «Мощение»: узор + материалы + шов → воркер → WebGL-превью; экспорт Diffuse / ERM / Normal DX в PNG 24 bit.
import { DEFAULTS, LAYOUTS, DECORS, ROT_MODES } from "./gen.js";
import { Viewer, VIEW_MODES } from "./view.js";
import { PRESETS, PRESET_TABS, PATTERN_KEYS } from "./presets.js";
import { MATERIALS, MAT_CATS, MAT_BY_ID } from "./materials.js";
import { JOINT_FILLS, FILL_BY_ID, JOINT_PROFILES, PROFILE_GROUPS, PROFILE_BY_ID, profileSVG } from "./joints.js";

const STORE_KEY = "texture-tools.paving.v3";
const OLD_STORE_KEY = "texture-tools.paving.v2";
const TAB_KEY = "texture-tools.paving.ptab";
const MCAT_KEY = "texture-tools.paving.mcat";
const THUMB_KEY = "texture-tools.paving.thumbs.v4"; // сменить версию, если меняется вид узоров
const THUMB_PX = 160;
const QUICK_RES = 1024; // быстрый проход превью, затем полный (previewRes)
const UI_DEFAULTS = { previewRes: 4096, exportRes: 2048, base: "T_Paving", udim: 1001, suffix: "_1", exportHeight: false, presetName: "", presetCat: "" };
const MAX_MAT = 9;
const clone = (v) => JSON.parse(JSON.stringify(v));

// подписи размеров и счётчиков под каждую раскладку
const LUI = {
  stack: { ex: "Элемент X", ey: "Элемент Y", cnt: "xy" },
  running: { ex: "Элемент X", ey: "Элемент Y", cnt: "xy" },
  diagonal: { ex: "Длина", ey: "Ширина", cnt: "mod" },
  herring90: { ex: "Длина", ey: "Ширина", cnt: "mod" },
  herring45: { ex: "Длина", ey: "Ширина", cnt: "modY" },
  chevron: { ex: "Длина планки", ey: "Ширина планки", cnt: "xy" },
  basket: { ex: "Длина", ey: "Ширина", cnt: "mod" },
  modular: { ex: "Модуль", cnt: "side" },
  windmill: { ex: "Прямоуг., длина", ey: "Прямоуг., ширина", cnt: "mod" },
  hopscotch: { ex: "Большой квадрат", ey: "Малый квадрат", cnt: "mod" },
  hex: { ex: "Под ключ", cnt: "xy" },
  rhombus: { ex: "Шестигр. под ключ", cnt: "xy" },
  scales: { ex: "Ширина чешуи", cnt: "mod" },
  voronoi: { ex: "Камень ~", cnt: "side" },
  bond: { ex: "Ложок (длина)", ey: "Тычок (ширина)", ez: "Высота кирпича", cnt: "bond" },
};
const CNT = {
  xy: [["countX", "Кол-во X", "шт, 0 = авто"], ["countY", "Кол-во Y", "рядов, 0 = авто"]],
  mod: [["countX", "Модулей", "по стороне, 0 = авто"]],
  modY: [["countY", "Модулей Y", "0 = авто"]],
  side: [["countX", "По стороне", "шт, 0 = авто"]],
  bond: [["countX", "Ложков", "по ширине, 0 = авто"], ["countY", "Рядов", "0 = авто"]],
};
const lui = (p) => LUI[p.layout] || LUI.stack;

// ───────── состояние ─────────
function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (e) { /* приватный режим, нет места */ }
  return null;
}
function base() { return clone(Object.assign({}, DEFAULTS, UI_DEFAULTS)); }

// узор из пресета: геометрия заменяется, материалы и шов пользователя сохраняются (full — взять и их из подсказки)
function applyPatternTo(P0, pr, full) {
  const P1 = base();
  for (const k of ["previewRes", "exportRes", "udim", "suffix", "exportHeight", "seed", "size", "noJoints", "jointFill", "jointColor", "jointProfile", "jointDepth", "jointRough", "normalStrength", "ao",
    "grain", "mottle", "speck", "speckContrast", "edgeDark", "chamfer", "profile", "corner", "irregular", "chip", "tilt", "lift", "relief", "reliefScale"]) if (P0 && k in P0) P1[k] = clone(P0[k]);
  for (const k of PATTERN_KEYS) P1[k] = clone(k in pr.p ? pr.p[k] : DEFAULTS[k]);
  // в пресетах количества заданы для плоскости 4 м — пересчёт под текущую
  const sc = (P1.size || 3000) / 4000;
  if (P1.countX > 0) P1.countX = Math.max(1, Math.round(P1.countX * sc));
  if (P1.countY > 0) P1.countY = Math.max(1, Math.round(P1.countY * sc));
  const pm = pr.p.materials || [{}];
  const need = P1.colorMode === "single" ? 1 : pm.length;
  const old = full || !P0 ? [] : P0.materials || [];
  P1.materials = [];
  for (let i = 0; i < Math.max(need, Math.min(old.length, MAX_MAT)); i++) {
    const keep = old[i] ? clone(old[i]) : null;
    const sl = keep && keep.lib ? keep : { lib: pr.slots[i] || pr.slots[pr.slots.length - 1] || (old[old.length - 1] || {}).lib || "profi_grey" };
    const src = pm[i] || {};
    // узоро-зависимые свойства слота: доля в смеси, выступ, наклон, декор
    sl.weight = src.weight || sl.weight || 1;
    sl.raise = src.raise || 0; sl.slope = src.slope || 0;
    sl.decor = src.decor || "none"; if (src.decorColor) sl.decorColor = src.decorColor;
    P1.materials.push(sl);
  }
  // шов: при смене категории (мощение ↔ кирпич) или по запросу — подсказка узора
  if (pr.j && (full || !P0 || P0.presetCat !== pr.cat)) {
    const f = FILL_BY_ID[pr.j.fill];
    P1.jointFill = pr.j.fill; P1.jointProfile = pr.j.profile; P1.jointDepth = pr.j.depth;
    if (f) { P1.jointColor = pr.j.color || f.colors[0][1]; P1.jointRough = f.r; }
  }
  P1.presetName = pr.name; P1.presetCat = pr.cat;
  P1.base = "T_" + pr.name.replace(/^[\d.]+\s*/, "").replace(/[«»"(),]/g, "").trim().split(/\s+/).slice(0, 3).join("_");
  P1.paint = null;
  return P1;
}
function load() {
  const s = store(STORE_KEY);
  if (s) { try { return Object.assign(base(), JSON.parse(s)); } catch (e) { /* битый JSON */ } }
  // перенос из прошлой версии: материалы и шов те же, новые значения по умолчанию (4K, 3 м, скрытые настройки — 0)
  const o = store(OLD_STORE_KEY);
  if (o) {
    try {
      const p = Object.assign(base(), JSON.parse(o));
      p.previewRes = UI_DEFAULTS.previewRes; p.size = DEFAULTS.size; p.countX = 0; p.countY = 0;
      for (const k of ["chamfer", "corner", "irregular", "chip", "tilt", "lift", "relief", "edgeDark", "grain", "mottle", "speck"]) p[k] = 0;
      for (const sm of p.materials || []) delete sm.vary;
      return p;
    } catch (e) { /* битый JSON */ }
  }
  return null;
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => store(STORE_KEY, JSON.stringify(P)), 300);
}

let P = load() || applyPatternTo(null, PRESETS[0], true);
let last = null;          // последний результат превью
let paintOn = false, paintMat = 2, paintPref = 2; // paintPref — выбор пользователя, paintMat — с учётом числа материалов
let activeSlot = 0;
const setStatus = (msg) => { const s = document.getElementById("status"); if (s) s.textContent = msg; };

// ───────── DOM-хелперы ─────────
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
const shows = [], dyn = [];
function row(label, kids, show) {
  const lab = typeof label === "function" ? h("label", { class: "pv-lab" }) : label ? h("label", { class: "pv-lab" }, label) : null;
  if (typeof label === "function") dyn.push([lab, label]);
  const r = h("div", { class: "row" }, lab, kids);
  if (show) shows.push([r, show]);
  return r;
}
function group(title, kids, show, cls) {
  const g = h("div", { class: "group " + (cls || "") }, h("div", { class: "group-title" }, title), kids);
  if (show) shows.push([g, show]);
  return g;
}
function updateShows() {
  for (let i = shows.length - 1; i >= 0; i--) {
    const [e, f] = shows[i];
    if (!e.isConnected && e.dataset.built) { shows.splice(i, 1); continue; } // старые строки слотов
    e.dataset.built = "1";
    e.style.display = f(P) ? "" : "none";
  }
  for (const [e, f] of dyn) { const v = f(P); if (e) e.textContent = v; } // e = null — только обновить значение
}

const controls = []; // [key, setter] — для перерисовки после смены пресета
function changed(key, v, delay) { P[key] = v; save(); updateShows(); updateNames(); schedule(delay); }

function numIn(key, o) {
  o = o || {};
  const i = h("input", { type: "number", class: "num", min: o.min, max: o.max, step: o.step || 1, style: o.w ? `width:${o.w}px` : null });
  i.value = P[key];
  i.addEventListener("input", () => { if (i.value !== "" && Number.isFinite(+i.value)) changed(key, +i.value); });
  controls.push([key, (v) => (i.value = v)]);
  return i;
}
function textIn(key, cls, delay) {
  const t = h("input", { type: "text", class: "text " + (cls || "") });
  t.value = P[key];
  t.addEventListener("input", () => changed(key, t.value, delay));
  controls.push([key, (v) => (t.value = v)]);
  return t;
}
function areaIn(key, rows) {
  const t = h("textarea", { class: "pv-rules", rows, spellcheck: "false" });
  t.value = P[key];
  t.addEventListener("input", () => changed(key, t.value, 300));
  controls.push([key, (v) => (t.value = v)]);
  return t;
}
function rangeIn(key, min, max, step) {
  const r = h("input", { type: "range", class: "slider", min, max, step });
  const n = h("input", { type: "number", class: "num", min, max, step });
  r.value = n.value = P[key];
  r.addEventListener("input", () => { n.value = r.value; changed(key, +r.value); });
  n.addEventListener("input", () => { if (n.value !== "" && Number.isFinite(+n.value)) { r.value = n.value; changed(key, +n.value); } });
  controls.push([key, (v) => (r.value = n.value = v)]);
  return [r, n];
}
function selIn(key, opts, cast) {
  const s = h("select", { class: "sel" }, opts.map(([v, t]) => h("option", { value: v }, t)));
  s.value = P[key];
  s.addEventListener("change", () => changed(key, cast ? cast(s.value) : s.value));
  controls.push([key, (v) => (s.value = v)]);
  return s;
}
function checkIn(key, text) {
  const c = h("input", { type: "checkbox" });
  c.checked = !!P[key];
  c.addEventListener("change", () => changed(key, c.checked));
  controls.push([key, (v) => (c.checked = !!v)]);
  return h("label", { class: "pv-check" }, c, text);
}
function syncControls() {
  for (const [k, set] of controls) set(P[k]);
  buildSlots(); buildJoint(); updateShows(); markPreset();
}

// ───────── разметка ─────────
const root = document.getElementById("panel-paving");
const side = h("div", { class: "pv-side" });
const split = h("div", { class: "pv-split", title: "Потяните, чтобы изменить ширину панели (двойной щелчок — сброс)" });
const canvas = h("canvas", { class: "pv-canvas" });
const busy = h("div", { class: "pv-busy" });
const checksBox = h("div", { class: "pv-checks" });
const fitBox = h("div", { class: "pv-fit" });
const paintSel = h("select", { class: "sel" });
const paintInfo = h("span", { class: "hint" });
const namesBox = h("div", { class: "hint name-hint pv-names" });
const exportMsg = h("span", { class: "hint" });
const rulesErr = h("div", { class: "pv-err" });
const isRows = (p) => p.layout === "stack" || p.layout === "running";

// ───────── галерея узоров (нейтральные миниатюры) ─────────
const gallery = h("div", { class: "pv-gallery" });
const presetTabs = h("div", { class: "pv-ptabs" });
let presetTab = store(TAB_KEY) || (PRESETS.find((p) => p.name === P.presetName) || PRESETS[0]).cat;
if (!PRESET_TABS.some(([id]) => id === presetTab)) presetTab = PRESET_TABS[0][0];
const cards = new Map();
function buildGallery() {
  presetTabs.textContent = "";
  for (const [id, title] of PRESET_TABS) {
    const n = PRESETS.filter((p) => p.cat === id).length;
    presetTabs.append(h("button", { class: "btn pv-ptab" + (id === presetTab ? " active" : ""), onclick: () => { presetTab = id; store(TAB_KEY, id); buildGallery(); } }, `${title} (${n})`));
  }
  gallery.textContent = "";
  for (const pr of PRESETS.filter((p) => p.cat === presetTab)) {
    let c = cards.get(pr.name);
    if (!c) {
      const img = h("img", { class: "pv-thumb", alt: "", draggable: "false" });
      const m = (pr.thumb || 1000) / 1000;
      const card = h("button", { class: "pv-card", title: pr.name + ` (миниатюра ${m} × ${m} м)`, onclick: () => applyPreset(pr) },
        h("div", { class: "pv-thumb-box" }, img, h("span", { class: "pv-thumb-m" }, `${m} м`)), h("span", { class: "pv-card-name" }, pr.name));
      c = { card, img };
      cards.set(pr.name, c);
      const cached = thumbCache[thumbKey(pr)];
      if (cached) img.src = cached;
    }
    gallery.append(c.card);
  }
  markPreset();
  queueThumbs();
}
function markPreset() { for (const [name, c] of cards) c.card.classList.toggle("active", name === P.presetName); }
function applyPreset(pr, full) {
  P = applyPatternTo(P, pr, full);
  activeSlot = Math.min(activeSlot, P.materials.length - 1);
  save(); syncControls(); schedule(0);
  setStatus("Мощение: узор «" + pr.name + "»" + (full ? " с материалами и швом" : ""));
}

// миниатюры узоров: отдельный воркер, плоскость 1 × 1 м (или thumb), кэш в localStorage
let thumbCache = {};
try { thumbCache = JSON.parse(store(THUMB_KEY) || "{}"); } catch (e) { thumbCache = {}; }
function thumbKey(pr) {
  const s = JSON.stringify([pr.p, pr.thumb || 1000, THUMB_PX, pr.j]);
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return (x >>> 0).toString(36);
}
let thumbWorker = null, thumbBusy = false, thumbSaveT = 0;
const thumbQueue = [];
function queueThumbs() {
  const order = PRESETS.filter((p) => p.cat === presetTab).concat(PRESETS.filter((p) => p.cat !== presetTab));
  thumbQueue.length = 0;
  for (const pr of order) if (!thumbCache[thumbKey(pr)]) thumbQueue.push(pr);
  pumpThumbs();
}
function pumpThumbs() {
  if (thumbBusy || !thumbQueue.length) return;
  if (!thumbWorker) {
    thumbWorker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    thumbWorker.onmessage = (e) => {
      const m = e.data;
      if (m.progress) return;
      thumbBusy = false;
      if (m.ok) {
        const cv = h("canvas", { width: m.size, height: m.size });
        cv.getContext("2d").putImageData(new ImageData(m.img, m.size, m.size), 0, 0);
        const url = cv.toDataURL("image/jpeg", 0.86);
        thumbCache[m.key] = url;
        const c = cards.get(m.name);
        if (c) c.img.src = url;
        clearTimeout(thumbSaveT);
        thumbSaveT = setTimeout(() => store(THUMB_KEY, JSON.stringify(thumbCache)), 800);
      }
      pumpThumbs();
    };
  }
  const pr = thumbQueue.shift();
  thumbBusy = true;
  thumbWorker.postMessage({ job: 0, mode: "thumb", preset: { name: pr.name, p: pr.p, thumb: pr.thumb, cat: pr.cat, j: pr.j }, N: THUMB_PX, key: thumbKey(pr) });
}

// файл настроек
const fileIn = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
fileIn.addEventListener("change", async () => {
  const f = fileIn.files[0];
  if (!f) return;
  try { P = Object.assign(base(), JSON.parse(await f.text())); save(); syncControls(); schedule(0); setStatus("Настройки загружены: " + f.name); }
  catch (e) { alert("Не удалось прочитать JSON: " + e.message); }
  fileIn.value = "";
});

// ───────── материалы: слоты + галерея библиотеки ─────────
const slotsBox = h("div", { class: "pv-slots" });
const matTabs = h("div", { class: "pv-ptabs pv-mtabs" });
const matGallery = h("div", { class: "pv-gallery pv-mgallery" });
const matDesc = h("div", { class: "hint pv-desc" });
let matCat = store(MCAT_KEY) || "granite";
const thumbImg = (src, color) => {
  const box = h("div", { class: "pv-thumb-box", style: `background:${color || "#555"}` });
  if (src) {
    const img = h("img", { class: "pv-thumb", src, alt: "", draggable: "false", loading: "lazy" });
    img.addEventListener("error", () => img.remove(), { once: true });
    box.append(img);
  }
  return box;
};
function slotName(sm) { const lib = sm && sm.lib && MAT_BY_ID[sm.lib]; return lib ? lib.name : "свой цвет " + ((sm && sm.color) || ""); }
let slotInfo = []; // из последнего превью: roughness материала по слотам
const slotRough = [];
function buildSlots() {
  slotsBox.textContent = "";
  slotRough.length = 0;
  P.materials.forEach((sm, i) => {
    const lib = sm.lib && MAT_BY_ID[sm.lib];
    const wIn = h("input", { type: "number", class: "num", min: 0, max: 100, step: 0.5, value: sm.weight || 1, title: "доля в смеси", style: "width:40px" });
    wIn.addEventListener("click", (e) => e.stopPropagation());
    wIn.addEventListener("input", () => { if (wIn.value !== "" && Number.isFinite(+wIn.value)) { sm.weight = +wIn.value; save(); schedule(); } });
    const wBox = h("span", { class: "pv-weight" }, "доля", wIn);
    shows.push([wBox, (p) => p.colorMode === "mix"]);
    const sIn = (k, def, min, max, step, title) => {
      const e = h("input", { type: "number", class: "num", min, max, step, title, value: sm[k] == null ? def : sm[k], style: "width:42px" });
      e.addEventListener("click", (ev) => ev.stopPropagation());
      e.addEventListener("input", () => { if (e.value !== "" && Number.isFinite(+e.value)) { sm[k] = +e.value; save(); schedule(); } });
      return e;
    };
    const scBox = h("span", { class: "pv-weight", title: "Масштаб текстуры: ×2 — рисунок вдвое мельче (камешки терраццо, зерно гранита)" }, "×", sIn("texScale", 1, 0.1, 20, 0.1));
    const hBox = h("span", { class: "pv-weight", title: "Высота (выступ) элементов этого слота над плоскостью, мм" }, "↑", sIn("raise", 0, -50, 100, 0.5), "мм");
    // roughness: пусто — как у материала (серым), своё значение — средняя roughness слота, рисунок карты сохраняется
    const auto = slotInfo[i] ? slotInfo[i].roughAuto : null;
    const rIn = h("input", { type: "number", class: "num" + (sm.rough == null ? " pv-auto" : ""), min: 0, max: 1, step: 0.01, style: "width:58px",
      title: "Roughness слота (G в ERM): средняя по материалу; серым — значение материала", value: sm.rough != null ? sm.rough : auto != null ? auto : "" });
    rIn.addEventListener("click", (ev) => ev.stopPropagation());
    rIn.addEventListener("input", () => { if (rIn.value !== "" && Number.isFinite(+rIn.value)) { sm.rough = Math.min(1, Math.max(0, +rIn.value)); rIn.classList.remove("pv-auto"); rReset.style.display = ""; save(); schedule(); } });
    const rReset = h("button", { class: "btn pv-x", title: "вернуть roughness материала", style: sm.rough == null ? "display:none" : "", onclick: (ev) => { ev.stopPropagation(); delete sm.rough; save(); buildSlots(); schedule(0); } }, "↺");
    slotRough[i] = { inp: rIn, sm };
    // оттенок: цвет + сила, %; при первом выборе цвета сила 100 %
    const tAmt = sIn("tintAmt", 0, 0, 100, 5, "Сила оттенка, %: 100 — средний цвет слота = выбранному, рисунок текстуры сохраняется");
    const tCol = h("input", { type: "color", class: "pv-color", title: "Оттенок материала слота", value: sm.tint || (lib && lib.color) || "#c8b89a" });
    tCol.addEventListener("click", (ev) => ev.stopPropagation());
    tCol.addEventListener("input", () => { sm.tint = tCol.value; if (!(+sm.tintAmt > 0)) { sm.tintAmt = 100; tAmt.value = 100; } save(); schedule(250); });
    const rotSel = h("select", { class: "sel", title: "Поворот текстуры на элементах слота" }, ROT_MODES.map(([v, t]) => h("option", { value: v }, t)));
    rotSel.value = sm.rotMode || "auto";
    rotSel.addEventListener("click", (ev) => ev.stopPropagation());
    rotSel.addEventListener("change", () => { sm.rotMode = rotSel.value; save(); schedule(0); });
    const rotAng = sIn("rotAngle", 0, -180, 180, 1, "Добавочный угол поворота текстуры, °");
    const mCb = h("input", { type: "checkbox", title: "Metallic слота (B в ERM): металл = 1" });
    mCb.checked = (sm.metal != null ? +sm.metal : lib ? lib.metal || 0 : 0) >= 0.5;
    mCb.addEventListener("click", (ev) => ev.stopPropagation());
    mCb.addEventListener("change", () => { sm.metal = mCb.checked ? 1 : 0; save(); schedule(0); });
    slotsBox.append(h("div", { class: "pv-slot" + (i === activeSlot ? " active" : ""), title: lib ? lib.desc : "", onclick: () => { activeSlot = i; buildSlots(); } },
      h("div", { class: "pv-slot-top" },
        h("b", {}, i + 1),
        thumbImg(lib ? `img/mat/${lib.id}.webp` : "", lib ? lib.color : sm.color),
        h("span", { class: "pv-slot-name" }, slotName(sm)),
        P.materials.length > 1 ? h("button", { class: "btn pv-x", title: "удалить слот", onclick: (e) => { e.stopPropagation(); P.materials.splice(i, 1); activeSlot = Math.min(activeSlot, P.materials.length - 1); P.paint = null; save(); buildSlots(); schedule(0); } }, "✕") : null),
      h("div", { class: "pv-slot-ctrl" }, scBox, hBox,
        h("span", { class: "pv-weight" }, "R", rIn, rReset),
        h("label", { class: "pv-check pv-weight" }, mCb, "металл"),
        wBox),
      h("div", { class: "pv-slot-ctrl" },
        h("span", { class: "pv-weight" }, "оттенок", tCol, tAmt, "%"),
        h("span", { class: "pv-weight" }, "поворот", rotSel, rotAng, "°"))));
  });
  const cur = P.materials[activeSlot] && MAT_BY_ID[P.materials[activeSlot].lib];
  matDesc.textContent = cur ? `Слот ${activeSlot + 1}: ${cur.name} — ${cur.desc}` : `Слот ${activeSlot + 1}: выберите материал ниже`;
  paintSel.textContent = "";
  P.materials.forEach((m, i) => paintSel.append(h("option", { value: i + 1 }, i + 1 + ". " + slotName(m))));
  paintMat = Math.min(paintPref, P.materials.length);
  paintSel.value = paintMat;
  buildMatGallery();
  buildSlotTuning();
  updateShows();
}
function buildMatGallery() {
  matTabs.textContent = "";
  for (const [id, title] of MAT_CATS) matTabs.append(h("button", { class: "btn pv-ptab" + (id === matCat ? " active" : ""), onclick: () => { matCat = id; store(MCAT_KEY, id); buildMatGallery(); } }, title));
  matGallery.textContent = "";
  const cur = P.materials[activeSlot] && P.materials[activeSlot].lib;
  for (const mt of MATERIALS.filter((x) => x.cat === matCat)) {
    matGallery.append(h("button", { class: "pv-card" + (mt.id === cur ? " active" : ""), title: mt.name + " — " + mt.desc, onclick: () => assignMaterial(mt) },
      thumbImg(`img/mat/${mt.id}.webp`, mt.color), h("span", { class: "pv-card-name" }, mt.name)));
  }
}
function assignMaterial(mt) {
  const sm = P.materials[activeSlot] || (P.materials[activeSlot] = {});
  for (const k of ["color", "rough", "metal", "vary", "roughAdj", "tint", "tintAmt", "emit"]) delete sm[k]; // поворот и масштаб слота остаются
  sm.lib = mt.id;
  save(); buildSlots(); schedule(0);
  setStatus(`Мощение: слот ${activeSlot + 1} — ${mt.name} (текстура загружается при первом выборе)`);
}

// ───────── шов: заполнение + цвет + профиль ─────────
const fillGallery = h("div", { class: "pv-gallery pv-fgallery" });
const fillColors = h("div", { class: "pv-swatches" });
const fillDesc = h("div", { class: "hint pv-desc" });
const profBox = h("div", { class: "pv-profiles" });
const profDesc = h("div", { class: "hint pv-desc" });
const jointColorIn = h("input", { type: "color", class: "pv-color", title: "свой цвет" });
jointColorIn.addEventListener("input", () => { P.jointColor = jointColorIn.value; save(); markJoint(); schedule(250); });
function buildJoint() {
  fillGallery.textContent = "";
  for (const f of JOINT_FILLS) {
    fillGallery.append(h("button", { class: "pv-card" + (f.id === P.jointFill ? " active" : ""), title: f.name + " — " + f.desc, onclick: () => {
      P.jointFill = f.id; P.jointColor = f.colors[0][1]; P.jointRough = f.r; P.jointMetal = 0;
      save(); buildJoint(); for (const [k, set] of controls) if (k === "jointRough" || k === "jointMetal") set(P[k]); schedule(0);
    } }, thumbImg(`img/fill/${f.id}.webp`, f.colors[0][1]), h("span", { class: "pv-card-name" }, f.name)));
  }
  profBox.textContent = "";
  const fcol = P.jointColor;
  for (const [gid, gname] of PROFILE_GROUPS) {
    const grid = h("div", { class: "pv-gallery pv-pgallery" });
    for (const p of JOINT_PROFILES.filter((x) => x.g === gid)) {
      grid.append(h("button", { class: "pv-card" + (p.id === P.jointProfile ? " active" : ""), title: p.name + " — " + p.desc, onclick: () => { P.jointProfile = p.id; save(); buildJoint(); schedule(0); } },
        h("div", { class: "pv-svg", html: profileSVG(p, fcol) }), h("span", { class: "pv-card-name" }, p.name)));
    }
    profBox.append(h("div", { class: "pv-pgroup" }, gname), grid);
  }
  markJoint();
}
function markJoint() {
  const f = FILL_BY_ID[P.jointFill] || JOINT_FILLS[0], p = PROFILE_BY_ID[P.jointProfile] || JOINT_PROFILES[0];
  fillColors.textContent = "";
  for (const [name, hex] of f.colors) {
    fillColors.append(h("button", { class: "pv-swatch" + (hex.toLowerCase() === String(P.jointColor).toLowerCase() ? " active" : ""), title: name, style: `background:${hex}`, onclick: () => { P.jointColor = hex; save(); markJoint(); schedule(0); } }));
  }
  jointColorIn.value = P.jointColor;
  fillColors.append(jointColorIn);
  fillDesc.textContent = `${f.name}: ${f.desc}`;
  profDesc.textContent = `${p.name}: ${p.desc}`;
}

const exRow = row((p) => lui(p).ex, [numIn("ex", { min: 1, max: 5000, w: 60 }), h("span", { class: "hint" }, "мм")]);
const eyRow = row((p) => lui(p).ey || "", [numIn("ey", { min: 1, max: 5000, w: 60 }), h("span", { class: "hint" }, "мм")], (p) => !!lui(p).ey);
const ezRow = row((p) => lui(p).ez || "", [numIn("ez", { min: 5, max: 500, w: 60 }), h("span", { class: "hint" }, "мм")], (p) => !!lui(p).ez);
const countRows = [0, 1].map((i) => row((p) => (CNT[lui(p).cnt][i] || [])[1] || "", [
  (() => {
    const inp = h("input", { type: "number", class: "num", min: 0, max: 5000 });
    const key = (p) => (CNT[lui(p).cnt][i] || [])[0];
    inp.addEventListener("input", () => { const k = key(P); if (k && inp.value !== "" && Number.isFinite(+inp.value)) changed(k, +inp.value); });
    dyn.push([null, (p) => { const k = key(p); if (k && document.activeElement !== inp) inp.value = p[k]; }]);
    return inp;
  })(),
  (() => { const s = h("span", { class: "hint" }); dyn.push([s, (p) => (CNT[lui(p).cnt][i] || [])[2] || ""]); return s; })(),
], (p) => !!CNT[lui(p).cnt][i]));

// тонкая настройка слотов (разброс тона, наклон, декор)
const slotTune = h("div", {});
function buildSlotTuning() {
  slotTune.textContent = "";
  P.materials.forEach((sm, i) => {
    const lib = sm.lib && MAT_BY_ID[sm.lib];
    const upd = (k, v, d) => { sm[k] = v; save(); schedule(d); };
    const nIn = (k, def, min, max, step, w, title) => {
      const e = h("input", { type: "number", class: "num", min, max, step, title, style: `width:${w}px` });
      e.value = sm[k] == null ? def : sm[k];
      e.addEventListener("input", () => { if (e.value !== "" && Number.isFinite(+e.value)) upd(k, +e.value); });
      return e;
    };
    const decor = h("select", { class: "sel", title: "рисунок на элементе (пэчворк)" }, DECORS.map(([v, t]) => h("option", { value: v }, t)));
    decor.value = sm.decor || "none";
    decor.addEventListener("change", () => { upd("decor", decor.value); buildSlotTuning(); });
    const dcol = h("input", { type: "color", class: "pv-color", value: sm.decorColor || "#2f3a4a" });
    dcol.addEventListener("input", () => upd("decorColor", dcol.value, 250));
    slotTune.append(h("div", { class: "pv-mat" },
      h("div", { class: "row" }, h("b", {}, i + 1), h("span", { class: "pv-slot-name" }, slotName(sm))),
      h("div", { class: "row pv-mat2" },
        h("span", { class: "hint", title: "разброс тона по элементам, %" }, "±"), nIn("vary", 0, 0, 50, 0.5, 40),
        h("span", { class: "hint", title: "перепад по ширине элемента, мм" }, "наклон"), nIn("slope", 0, -100, 100, 0.5, 44)),
      h("div", { class: "row pv-mat2" }, h("span", { class: "hint" }, "декор"), decor, sm.decor && sm.decor !== "none" ? dcol : null)));
  });
}

// настройки шва — скрыты, когда швы выключены
const jointBody = h("div", {},
  row("Ширина", [numIn("joint", { min: 0, max: 100, step: 0.5 }), h("span", { class: "hint" }, "мм"), h("label", {}, "Глубина / выступ"), numIn("jointDepth", { min: 0, max: 40, step: 0.5 }), h("span", { class: "hint" }, "мм")]),
  row("Roughness", [numIn("jointRough", { min: 0, max: 1, step: 0.01 }), h("span", { class: "hint", title: "G в ERM; при выборе заполнения ставится его значение" }, "G в ERM"), checkIn("jointMetal", "металл")]),
  h("div", { class: "pv-sub" }, "Заполнение"), fillGallery, fillColors, fillDesc,
  h("div", { class: "pv-sub" }, "Профиль"), profDesc, profBox);
shows.push([jointBody, (p) => !p.noJoints]);

side.append(
  group("Узор", [
    presetTabs,
    gallery,
    row(null, [
      h("button", { class: "btn", title: "Подставить материалы и шов, рекомендованные для этого узора", onclick: () => { const pr = PRESETS.find((x) => x.name === P.presetName); if (pr) applyPreset(pr, true); } }, "Материалы и шов из узора"),
    ]),
  ]),
  group("Материалы", [
    h("div", { class: "hint pv-desc" }, "Слот = материал узора (1 — основной). Выберите слот и щёлкните материал в библиотеке. × — масштаб текстуры, ↑ — высота элементов, R — roughness, оттенок — свой цвет материала, поворот — как ложится текстура на элементы."),
    slotsBox,
    row(null, [h("button", { class: "btn", onclick: () => { if (P.materials.length < MAX_MAT) { P.materials.push(clone(P.materials[P.materials.length - 1])); activeSlot = P.materials.length - 1; save(); buildSlots(); schedule(0); } } }, "+ слот")]),
    matDesc, matTabs, matGallery,
  ]),
  group("Раскладка цветов", [
    row("Режим", [selIn("colorMode", [["single", "Один материал (слот 1)"], ["mix", "Смесь по долям"], ["parts", "По частям узора / типу кирпича"], ["rules", "Правило рядов"]])]),
    row(null, [h("div", { class: "hint pv-help" }, "часть 1 → слот 1, часть 2 → слот 2…\nкирпич: ложок 1, тычок 2, солдатик 3, на ребро 4")], (p) => p.colorMode === "parts"),
    row(null, [areaIn("rules", 5)], (p) => p.colorMode === "rules"),
    h("div", {}, rulesErr),
    row(null, [h("div", { class: "hint pv-help" },
      "Строка = ряд сверху вниз, строки идут циклом.\n" +
      "-  ряд из слота 1   =2  ряд из слота 2\n" +
      "4 1  промежутки: 4 осн., вставка, 1 осн., вставка…\n" +
      ":1121  явная последовательность слотов\n" +
      "*3 слот вставки (по умолч. 2)   /1 основной\n" +
      ">-1 сдвиг каждого след. такого ряда (− влево)\n" +
      "@2 начальный сдвиг   # комментарий")], (p) => p.colorMode === "rules"),
    row(null, [checkIn("snapRows", "Подгонять число рядов под цикл правила")], (p) => p.colorMode === "rules"),
    row(null, [checkIn("noTouch", "Вставки не должны касаться (сторонами и углами)")], (p) => p.colorMode !== "single"),
    row("Кисть", [
      (() => { const c = h("input", { type: "checkbox" }); c.addEventListener("change", () => { paintOn = c.checked; canvas.classList.toggle("painting", paintOn); }); return h("label", { class: "pv-check" }, c, "красить"); })(),
      paintSel,
      h("button", { class: "btn", onclick: () => { P.paint = null; save(); schedule(0); } }, "Сброс"),
    ]),
    row(null, [h("span", { class: "hint" }, "ЛКМ по элементу — слот кисти, ПКМ — вернуть как было"), paintInfo]),
  ]),
  group("Шов", [
    row(null, [checkIn("noJoints", "Без швов — сплошное покрытие")]),
    row(null, [h("div", { class: "hint pv-help" },
      "Элементы встык сливаются: нет шва, фаски и разброса тона, в том числе на границе тайла.\n" +
      "Текстура слота идёт сплошь и бесшовно — её масштаб подгоняется до целого числа повторов на плоскость,\n" +
      "поворот — кратно 90°. Разные материалы слотов стыкуются встык.")], (p) => p.noJoints),
    jointBody,
  ]),
  group("Раскладка", [
    row("Тип", [selIn("layout", LAYOUTS.map((l) => [l.id, l.name]))]),
    exRow, eyRow, ezRow,
    row("Смещение", [selIn("offset", [["1/2", "1/2"], ["1/3", "1/3"], ["1/4", "1/4"], ["1/5", "1/5"], ["2/5", "2/5"], ["rand", "случайное"]])], (p) => p.layout === "running"),
    row("Угол", [selIn("angle", [[30, "30°"], [45, "45°"], [60, "60°"]], Number)], (p) => p.layout === "chevron"),
    row("Планок в элементе", [selIn("multi", [[1, "1 (обычная)"], [2, "2 (двойная)"], [3, "3 (тройная)"]], Number)], (p) => p.layout === "herring90" || p.layout === "herring45"),
    row("Форматы", [textIn("modSizes", "pv-wide", 300)], (p) => p.layout === "modular"),
    row(null, [h("div", { class: "hint pv-help" }, "в модулях: 2x1 — 2 по X, 1 по Y; вес — 2x1:3")], (p) => p.layout === "modular"),
    row(null, [areaIn("bond", 5)], (p) => p.layout === "bond"),
    row(null, [h("div", { class: "hint pv-help" },
      "Строка = ряд сверху вниз, строки идут циклом.\n" +
      "L ложок   T тычок   R ложок на ребро   S солдатик\n" +
      "_2 пустота (в четвертях кирпича)   ? случайный ряд\n" +
      "@2 сдвиг ряда (четверти)   >1 сдвиг каждого цикла\n" +
      "Пример фламандской: «L T» / «L T @3»")], (p) => p.layout === "bond"),
    row("Разброс", [...rangeIn("jitter", 0, 100, 1), h("span", { class: "hint" }, "%")], (p) => isRows(p) || p.layout === "voronoi"),
    row("Релаксация", [selIn("relax", [[0, "0"], [1, "1"], [2, "2"], [3, "3"]], Number), h("span", { class: "hint" }, "ровнее камни")], (p) => p.layout === "voronoi"),
    ...countRows,
    row(null, [checkIn("rotate", "Повернуть на 90°")]),
    fitBox,
  ]),
  group("Текстура", [
    row("Плоскость", [numIn("size", { min: 100, max: 100000, step: 10, w: 70 }), h("span", { class: "hint" }, "мм × мм (квадрат)")]),
    row("Seed", [numIn("seed", { min: 0, max: 999999 }), h("button", { class: "btn", onclick: () => { P.seed = Math.floor(Math.random() * 99999); syncControls(); save(); schedule(0); } }, "🎲")]),
    row("Превью", [selIn("previewRes", [[1024, "1024 px"], [2048, "2048 px"], [4096, "4096 px (4K)"]], Number), h("span", { class: "hint" }, "сначала 1K, затем полное")]),
  ]),
  group("Экспорт (PNG 24 bit)", [
    row("Размер", [selIn("exportRes", [[2048, "2048 × 2048"], [4096, "4096 × 4096"]], Number)]),
    row("База", [textIn("base")]),
    row("UDIM", [numIn("udim", { min: 1001, max: 1100 }), h("label", {}, "Суффикс"), textIn("suffix", "short")]),
    namesBox,
    row(null, [checkIn("exportHeight", "+ Height 16 bit (для displacement)")]),
    row(null, [
      h("button", { class: "btn primary", onclick: () => doExport("zip") }, "Скачать ZIP"),
      h("button", { class: "btn", onclick: () => doExport("Diffuse") }, "Diffuse"),
      h("button", { class: "btn", onclick: () => doExport("ERM") }, "ERM"),
      h("button", { class: "btn", onclick: () => doExport("Normal") }, "Normal"),
    ]),
    row(null, [exportMsg]),
    row(null, [
      h("button", { class: "btn", onclick: () => download(new Blob([JSON.stringify(P, null, 2)], { type: "application/json" }), outBase() + ".paving.json") }, "Сохранить настройки"),
      h("button", { class: "btn", onclick: () => fileIn.click() }, "Открыть…"), fileIn,
    ]),
  ]),
  h("details", { class: "group pv-details" },
    h("summary", { class: "group-title" }, "Тонкая настройка (кромка, поверхность, карты, слоты)"),
    h("div", { class: "pv-sub" }, "Кромка"),
    row("Фаска", [...rangeIn("chamfer", 0, 20, 0.5), "мм"]),
    row("Профиль", [selIn("profile", [["round", "радиус"], ["flat", "45°"]])]),
    row("Скругл. углов", [...rangeIn("corner", 0, 60, 0.5), "мм"]),
    row("Неровн. граней", [...rangeIn("irregular", 0, 30, 0.5), "мм"]),
    row("Сколы", [...rangeIn("chip", 0, 15, 0.25), "мм"]),
    h("div", { class: "pv-sub" }, "Укладка и поверхность"),
    row("Наклон элементов", [...rangeIn("tilt", 0, 10, 0.1), "мм"]),
    row("Перепад высоты", [...rangeIn("lift", 0, 10, 0.1), "мм"]),
    row("Рельеф (колотый)", [...rangeIn("relief", 0, 10, 0.05), "мм"]),
    row("Масштаб рельефа", [...rangeIn("reliefScale", 1, 200, 1), "мм"]),
    row("Темнее у кромки", [...rangeIn("edgeDark", 0, 50, 1), "%"]),
    row("Зерно (доп.)", [...rangeIn("grain", 0, 30, 0.5), "%"]),
    row("Пятна (доп.)", [...rangeIn("mottle", 0, 30, 0.5), "%"]),
    row("Крапины (свой цвет)", [...rangeIn("speck", 0, 100, 1)]),
    row("Контраст крапин", [...rangeIn("speckContrast", 0, 100, 1), "%"]),
    h("div", { class: "pv-sub" }, "Карты"),
    row("Сила нормали", [...rangeIn("normalStrength", 0, 5, 0.05)]),
    row("AO в Diffuse", [...rangeIn("ao", 0, 100, 1), "%"]),
    h("div", { class: "pv-sub" }, "Слоты"),
    slotTune,
  ),
);

// панель превью
const modeBtns = VIEW_MODES.map(([m, t]) => h("button", { class: "btn pv-mode", onclick: () => { viewer.mode = m; modeBtns.forEach((b, i) => b.classList.toggle("active", VIEW_MODES[i][0] === m)); viewer.draw(); } }, t));
const repBtns = [1, 2, 3].map((n) => h("button", { class: "btn pv-rep", onclick: () => { viewer.rep = n; repBtns.forEach((b, i) => b.classList.toggle("active", i + 1 === n)); viewer.resetView(); } }, n + "×" + n));
const lightAz = h("input", { type: "range", class: "slider", min: 0, max: 360, step: 1, value: 135, title: "азимут света" });
const lightEl = h("input", { type: "range", class: "slider", min: 3, max: 90, step: 1, value: 35, title: "высота света" });
const gridCb = h("input", { type: "checkbox" });
const canvasWrap = h("div", { class: "pv-canvas-wrap" }, canvas, busy);
const hsplit = h("div", { class: "pv-hsplit", title: "Потяните, чтобы изменить высоту проверок (двойной щелчок — сброс)" });
root.append(h("div", { class: "pv-layout" }, side, split, h("div", { class: "pv-main" },
  h("div", { class: "pv-toolbar" }, modeBtns, h("span", { class: "pv-sep" }), repBtns, h("span", { class: "pv-sep" }),
    h("label", { class: "pv-check" }, gridCb, "границы тайла"), h("span", { class: "pv-sep" }),
    h("span", { class: "hint" }, "свет"), lightAz, lightEl,
    h("button", { class: "btn", onclick: () => viewer.resetView() }, "Сброс вида")),
  canvasWrap,
  hsplit,
  h("div", { class: "group pv-checks-group" }, h("div", { class: "group-title" }, "Проверки правил"), checksBox),
)));

// ширина панели настроек: по умолчанию 560 px (CSS) при каждой загрузке, разделитель можно тянуть
function setSideWidth(w) {
  const max = Math.max(320, root.getBoundingClientRect().width - 320);
  w = Math.round(Math.max(260, Math.min(max, w)));
  side.style.width = w + "px";
  return w;
}
{
  let drag0 = null;
  split.addEventListener("pointerdown", (e) => {
    split.setPointerCapture(e.pointerId);
    drag0 = { x: e.clientX, w: side.getBoundingClientRect().width };
    split.classList.add("dragging");
    e.preventDefault();
  });
  split.addEventListener("pointermove", (e) => { if (drag0) setSideWidth(drag0.w + e.clientX - drag0.x); });
  const end = () => {
    if (!drag0) return;
    drag0 = null;
    split.classList.remove("dragging");
  };
  split.addEventListener("pointerup", end);
  split.addEventListener("pointercancel", end);
  split.addEventListener("dblclick", () => { side.style.width = ""; }); // двойной щелчок — снова 560 px
}
// высота панели проверок: тянуть границу над ней (вверх — больше), по умолчанию 150 px
{
  let d0 = null;
  hsplit.addEventListener("pointerdown", (e) => {
    hsplit.setPointerCapture(e.pointerId);
    d0 = { y: e.clientY, h: checksBox.getBoundingClientRect().height };
    hsplit.classList.add("dragging");
    e.preventDefault();
  });
  hsplit.addEventListener("pointermove", (e) => {
    if (!d0) return;
    const max = Math.max(80, root.getBoundingClientRect().height - 260);
    checksBox.style.height = Math.round(Math.max(40, Math.min(max, d0.h + d0.y - e.clientY))) + "px";
  });
  const end = () => { d0 = null; hsplit.classList.remove("dragging"); };
  hsplit.addEventListener("pointerup", end);
  hsplit.addEventListener("pointercancel", end);
  hsplit.addEventListener("dblclick", () => { checksBox.style.height = ""; });
}
paintSel.addEventListener("change", () => (paintMat = paintPref = +paintSel.value));

// ───────── имена файлов ─────────
function outBase() {
  let b = String(P.base || "T_Paving").trim().replace(/\s+/g, "_").replace(/[^\w.-]/g, "");
  if (!/^T_/i.test(b)) b = "T_" + b;
  return b;
}
function fileName(type) { return `${outBase()}_${type}${P.suffix || ""}.${P.udim || 1001}.png`; }
function updateNames() {
  namesBox.textContent = ["Diffuse", "ERM", "Normal"].map(fileName).join("\n") + (P.exportHeight ? "\n" + fileName("Height") : "");
}

// ───────── воркер превью ─────────
const viewer = new Viewer(canvas);
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" }); // быстрый проход
let fullWorker = null, fullBusy = false, fullJob = 0;                                   // полный проход (4K)
let job = 0, running = false, pending = false, timer = 0;
function snapshot() { return clone(P); }
function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(runPreview, delay == null ? 120 : delay);
}
function runPreview() {
  // параметры изменились — устаревший полный проход не нужен
  if (fullBusy && fullWorker) { fullWorker.terminate(); fullWorker = null; fullBusy = false; }
  if (running) { pending = true; return; }
  running = true;
  busy.textContent = "генерация…";
  busy.style.display = "block";
  worker.postMessage({ job: ++job, params: snapshot(), N: Math.min(QUICK_RES, P.previewRes), mode: "preview" });
}
function runFull() {
  if (!fullWorker) {
    fullWorker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    fullWorker.onmessage = (e) => {
      const m = e.data;
      if (m.job !== fullJob) return;
      if (m.progress) { busy.textContent = `${P.previewRes} px: ${m.stage} ${Math.round(m.frac * 100)} %`; return; }
      fullBusy = false;
      busy.style.display = "none";
      if (m.ok) applyPreview(m);
    };
  }
  fullBusy = true;
  fullJob = ++job;
  busy.textContent = `${P.previewRes} px…`;
  busy.style.display = "block";
  fullWorker.postMessage({ job: fullJob, params: snapshot(), N: P.previewRes, mode: "preview" });
}
worker.onmessage = (e) => {
  const m = e.data;
  if (m.progress) { busy.textContent = `${m.stage} ${Math.round(m.frac * 100)} %`; return; }
  running = false;
  if (pending) { pending = false; runPreview(); }
  else if (m.ok && P.previewRes > m.N) runFull();
  else busy.style.display = "none";
  applyPreview(m);
};
function applyPreview(m) {
  if (!m.ok) { checksBox.textContent = ""; checksBox.append(h("div", { class: "pv-chk err" }, "✗ Ошибка: " + m.error)); setStatus("Мощение: ошибка — " + m.error); return; }
  last = m;
  if (P.paint && P.paint.sig !== m.sig) {
    P.paint = null; save();
    setStatus("Мощение: раскладка изменилась — ручная роспись сброшена");
  }
  viewer.setMaps(m.N, m);
  if (m.info.slots) {
    slotInfo = m.info.slots;
    slotRough.forEach((r, i) => { if (r.sm.rough == null && slotInfo[i] && document.activeElement !== r.inp) r.inp.value = slotInfo[i].roughAuto; });
  }
  renderChecks(m.checks);
  fitBox.textContent = `${m.info.countText}\n${m.info.elemText}`;
  paintInfo.textContent = m.info.painted ? ` · вручную: ${m.info.painted}` : "";
  const err = m.checks.find((c) => /^Правило:/.test(c.text));
  rulesErr.textContent = err ? err.text : "";
  setStatus(`Мощение: превью ${m.N} px · ${m.info.cells} элементов · ${m.info.ms} мс` + (fullBusy ? ` · считается ${P.previewRes} px…` : ""));
}
worker.onerror = (e) => { running = false; busy.style.display = "none"; setStatus("Мощение: сбой воркера — " + (e.message || e)); };

function renderChecks(list) {
  checksBox.textContent = "";
  const icon = { ok: "✓", warn: "⚠", err: "✗", info: "ℹ" };
  for (const c of list) checksBox.append(h("div", { class: "pv-chk " + c.level }, icon[c.level] + " " + c.text));
}

// ───────── экспорт ─────────
let exportWorker = null, exportCache = null;
function exportKey() {
  const p = snapshot();
  for (const k of ["previewRes", "base", "udim", "suffix", "presetName", "presetCat"]) delete p[k];
  return JSON.stringify(p);
}
function runExport() {
  return new Promise((resolve, reject) => {
    if (!exportWorker) exportWorker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    const id = ++job;
    exportWorker.onmessage = (e) => {
      const m = e.data;
      if (m.job !== id) return;
      if (m.progress) { exportMsg.textContent = `${P.exportRes} px: ${m.stage} ${Math.round(m.frac * 100)} %`; return; }
      m.ok ? resolve(m) : reject(new Error(m.error));
    };
    exportWorker.onerror = (e) => reject(new Error(e.message || "сбой воркера"));
    exportWorker.postMessage({ job: id, params: snapshot(), N: P.exportRes, mode: "export" });
  });
}
let exporting = false;
async function doExport(which) {
  if (exporting) return;
  exporting = true;
  try {
    const key = exportKey();
    if (!exportCache || exportCache.key !== key) {
      exportMsg.textContent = `${P.exportRes} px: генерация…`;
      const t0 = Date.now();
      exportCache = { key, res: await runExport() };
      exportCache.ms = Date.now() - t0;
    }
    const r = exportCache.res;
    const errs = r.checks.filter((c) => c.level === "err").length;
    if (which === "zip") {
      if (typeof JSZip === "undefined") throw new Error("JSZip не загрузился");
      const zip = new JSZip();
      for (const t of Object.keys(r.files)) zip.file(fileName(t), r.files[t], { binary: true, compression: "STORE" });
      zip.file(outBase() + ".paving.json", JSON.stringify(Object.assign(snapshot(), { checks: r.checks.map((c) => c.level + ": " + c.text) }), null, 2));
      download(await zip.generateAsync({ type: "blob" }), `${outBase()}${P.suffix || ""}.${P.udim || 1001}_${r.N}.zip`);
    } else {
      download(new Blob([r.files[which]], { type: "image/png" }), fileName(which));
    }
    exportMsg.textContent = `Готово: ${r.N} × ${r.N}` + (exportCache.ms ? `, ${(exportCache.ms / 1000).toFixed(1)} с` : "") + (errs ? ` · ошибок проверки: ${errs}` : "");
    exportCache.ms = 0;
    setStatus("Мощение: экспорт " + (which === "zip" ? "ZIP" : fileName(which)));
  } catch (e) {
    exportMsg.textContent = "Ошибка экспорта: " + e.message;
  } finally {
    exporting = false;
  }
}
function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ───────── мышь: зум, пан, кисть ─────────
let drag = null;
function paintAt(ev, erase) {
  if (!last || !last.ids) return;
  const uv = viewer.toUV(ev.clientX, ev.clientY);
  if (!uv) return;
  const N = last.N, fu = uv.u - Math.floor(uv.u), fv = uv.v - Math.floor(uv.v);
  const c = last.ids[Math.min(N - 1, Math.floor(fv * N)) * N + Math.min(N - 1, Math.floor(fu * N))];
  if (!P.paint || P.paint.sig !== last.sig) P.paint = { sig: last.sig, map: {} };
  const map = P.paint.map;
  if (erase) { if (!(c in map)) return; delete map[c]; }
  else { if (map[c] === paintMat - 1) return; map[c] = paintMat - 1; }
  save();
  schedule(30);
}
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  if (paintOn && (e.button === 0 || e.button === 2)) { drag = { paint: true, erase: e.button === 2 }; paintAt(e, drag.erase); return; }
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (drag.paint) { paintAt(e, drag.erase); return; }
  viewer.panBy(e.clientX - drag.x, e.clientY - drag.y);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener("pointerup", () => (drag = null));
canvas.addEventListener("pointercancel", () => (drag = null));
canvas.addEventListener("wheel", (e) => { e.preventDefault(); viewer.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
canvas.addEventListener("dblclick", () => viewer.resetView());
lightAz.addEventListener("input", () => { viewer.az = +lightAz.value; viewer.draw(); });
lightEl.addEventListener("input", () => { viewer.el = +lightEl.value; viewer.draw(); });
gridCb.addEventListener("change", () => { viewer.grid = gridCb.checked; viewer.draw(); });
new ResizeObserver(() => viewer.resize()).observe(canvasWrap);

modeBtns[0].classList.add("active");
repBtns[1].classList.add("active");
buildSlots();
buildJoint();
buildGallery();
updateShows();
updateNames();
schedule(0);
