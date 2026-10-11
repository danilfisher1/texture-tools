// Вкладка «Мощение»: настройки → воркер → WebGL-превью; экспорт Diffuse / ERM / Normal DX в PNG 24 bit.
import { DEFAULTS, LAYOUTS, DECORS } from "./gen.js";
import { Viewer, VIEW_MODES } from "./view.js";
import { PRESETS, PRESET_TABS } from "./presets.js";

const STORE_KEY = "texture-tools.paving.v1";
const SIDE_KEY = "texture-tools.paving.side";
const TAB_KEY = "texture-tools.paving.ptab";
const THUMB_KEY = "texture-tools.paving.thumbs.v2"; // сменить версию, если меняется вид генерации
const THUMB_PX = 160;
const UI_DEFAULTS = { previewRes: 1024, exportRes: 2048, base: "T_Paving", udim: 1001, suffix: "_1", exportHeight: false, presetName: "" };
const MAX_MAT = 9;

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
function fresh(preset) {
  const p = JSON.parse(JSON.stringify(Object.assign({}, DEFAULTS, UI_DEFAULTS, preset ? preset.p : {})));
  p.paint = null;
  p.presetName = preset ? preset.name : "";
  return p;
}
function store(key, val) {
  try {
    if (val === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, val);
  } catch (e) { /* приватный режим, нет места */ }
  return null;
}
function load() {
  const s = store(STORE_KEY);
  if (s) { try { return Object.assign(fresh(), JSON.parse(s)); } catch (e) { /* битый JSON */ } }
  return null;
}
let saveT = 0;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => store(STORE_KEY, JSON.stringify(P)), 300);
}

let P = load() || fresh(PRESETS[0]);
let last = null;          // последний результат превью
let paintOn = false, paintMat = 2, paintPref = 2; // paintPref — выбор пользователя, paintMat — с учётом числа материалов
const setStatus = (msg) => { const s = document.getElementById("status"); if (s) s.textContent = msg; };

// ───────── DOM-хелперы ─────────
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k === "class") e.className = v;
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
function group(title, kids, show) {
  const g = h("div", { class: "group" }, h("div", { class: "group-title" }, title), kids);
  if (show) shows.push([g, show]);
  return g;
}
function updateShows() {
  for (let i = shows.length - 1; i >= 0; i--) {
    const [e, f] = shows[i];
    if (!e.isConnected && e.dataset.built) { shows.splice(i, 1); continue; } // старые строки материалов
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
function colorIn(key) {
  const c = h("input", { type: "color", class: "pv-color" });
  c.value = P[key];
  c.addEventListener("input", () => changed(key, c.value, 250));
  controls.push([key, (v) => (c.value = v)]);
  return c;
}
function syncControls() {
  for (const [k, set] of controls) set(P[k]);
  buildMaterials();
  updateShows();
  markPreset();
}

// ───────── разметка ─────────
const root = document.getElementById("panel-paving");
const side = h("div", { class: "pv-side" });
const split = h("div", { class: "pv-split", title: "Потяните, чтобы изменить ширину панели (двойной щелчок — сброс)" });
const canvas = h("canvas", { class: "pv-canvas" });
const busy = h("div", { class: "pv-busy" });
const checksBox = h("div", { class: "pv-checks" });
const fitBox = h("div", { class: "pv-fit" });
const matBox = h("div", { class: "pv-mats" });
const paintSel = h("select", { class: "sel" });
const paintInfo = h("span", { class: "hint" });
const namesBox = h("div", { class: "hint name-hint pv-names" });
const exportMsg = h("span", { class: "hint" });
const rulesErr = h("div", { class: "pv-err" });

const isRows = (p) => p.layout === "stack" || p.layout === "running";

// ───────── галерея пресетов ─────────
const gallery = h("div", { class: "pv-gallery" });
const presetTabs = h("div", { class: "pv-ptabs" });
let presetTab = store(TAB_KEY) || (PRESETS.find((p) => p.name === P.presetName) || PRESETS[0]).cat;
const cards = new Map(); // имя пресета → { card, img }
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
      const card = h("button", { class: "pv-card", title: pr.name + ` (миниатюра ${(pr.thumb || 1000) / 1000} × ${(pr.thumb || 1000) / 1000} м)`, onclick: () => applyPreset(pr) },
        h("div", { class: "pv-thumb-box" }, img, h("span", { class: "pv-thumb-m" }, `${(pr.thumb || 1000) / 1000} м`)), h("span", { class: "pv-card-name" }, pr.name));
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
function markPreset() {
  for (const [name, c] of cards) c.card.classList.toggle("active", name === P.presetName);
}
function applyPreset(pr) {
  const keep = { previewRes: P.previewRes, exportRes: P.exportRes, udim: P.udim, suffix: P.suffix, exportHeight: P.exportHeight };
  P = Object.assign(fresh(pr), keep);
  save(); syncControls(); schedule(0);
  setStatus("Мощение: пресет «" + pr.name + "»");
}

// миниатюры: отдельный воркер, раскладка на плоскости 1 × 1 м (или thumb), кэш в localStorage
let thumbCache = {};
try { thumbCache = JSON.parse(store(THUMB_KEY) || "{}"); } catch (e) { thumbCache = {}; }
function thumbKey(pr) {
  const s = JSON.stringify([pr.p, pr.thumb || 1000, THUMB_PX]);
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
  thumbWorker.postMessage({ job: 0, mode: "thumb", preset: { name: pr.name, p: pr.p, thumb: pr.thumb }, N: THUMB_PX, key: thumbKey(pr) });
}

// файл настроек
const fileIn = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
fileIn.addEventListener("change", async () => {
  const f = fileIn.files[0];
  if (!f) return;
  try { P = Object.assign(fresh(), JSON.parse(await f.text())); save(); syncControls(); schedule(0); setStatus("Настройки загружены: " + f.name); }
  catch (e) { alert("Не удалось прочитать JSON: " + e.message); }
  fileIn.value = "";
});

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

side.append(
  group("Пресеты", [
    presetTabs,
    gallery,
    row(null, [
      h("button", { class: "btn", onclick: () => download(new Blob([JSON.stringify(P, null, 2)], { type: "application/json" }), outBase() + ".paving.json") }, "Сохранить настройки"),
      h("button", { class: "btn", onclick: () => fileIn.click() }, "Открыть…"), fileIn,
    ]),
  ]),
  group("Текстура", [
    row("Плоскость", [numIn("size", { min: 100, max: 100000, step: 10, w: 70 }), h("span", { class: "hint" }, "мм × мм (квадрат)")]),
    row("Seed", [numIn("seed", { min: 0, max: 999999 }), h("button", { class: "btn", onclick: () => { P.seed = Math.floor(Math.random() * 99999); syncControls(); save(); schedule(0); } }, "🎲")]),
    row("Превью", [selIn("previewRes", [[512, "512 px"], [1024, "1024 px"], [2048, "2048 px"]], Number)]),
  ]),
  group("Раскладка", [
    row("Тип", [selIn("layout", LAYOUTS.map((l) => [l.id, l.name]))]),
    exRow, eyRow, ezRow,
    row("Шов", [numIn("joint", { min: 0, max: 100, step: 0.5 }), h("span", { class: "hint" }, "мм")]),
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
  group("Материалы", [matBox, row(null, [h("button", { class: "btn", onclick: () => addMat() }, "+ материал")])]),
  group("Раскладка цветов", [
    row("Режим", [selIn("colorMode", [["single", "Один материал (1)"], ["mix", "Смесь по долям"], ["parts", "По частям узора / типу кирпича"], ["rules", "Правило рядов"]])]),
    row(null, [h("div", { class: "hint pv-help" }, "часть 1 → материал 1, часть 2 → материал 2…\nкирпич: ложок 1, тычок 2, солдатик 3, на ребро 4")], (p) => p.colorMode === "parts"),
    row(null, [areaIn("rules", 5)], (p) => p.colorMode === "rules"),
    h("div", {}, rulesErr),
    row(null, [h("div", { class: "hint pv-help" },
      "Строка = ряд сверху вниз, строки идут циклом.\n" +
      "-  ряд из материала 1   =2  ряд из материала 2\n" +
      "4 1  промежутки: 4 осн., вставка, 1 осн., вставка…\n" +
      ":1121  явная последовательность материалов\n" +
      "*3 материал вставки (по умолч. 2)   /1 основной\n" +
      ">-1 сдвиг каждого след. такого ряда (− влево)\n" +
      "@2 начальный сдвиг   # комментарий")], (p) => p.colorMode === "rules"),
    row(null, [checkIn("snapRows", "Подгонять число рядов под цикл правила")], (p) => p.colorMode === "rules"),
    row(null, [checkIn("noTouch", "Вставки не должны касаться (сторонами и углами)")], (p) => p.colorMode !== "single"),
    row("Кисть", [
      (() => { const c = h("input", { type: "checkbox" }); c.addEventListener("change", () => { paintOn = c.checked; canvas.classList.toggle("painting", paintOn); }); return h("label", { class: "pv-check" }, c, "красить"); })(),
      paintSel,
      h("button", { class: "btn", onclick: () => { P.paint = null; save(); schedule(0); } }, "Сброс"),
    ]),
    row(null, [h("span", { class: "hint" }, "ЛКМ по элементу — материал кисти, ПКМ — вернуть как было"), paintInfo]),
  ]),
  group("Кромка", [
    row("Фаска", [...rangeIn("chamfer", 0, 20, 0.5), "мм"]),
    row("Профиль", [selIn("profile", [["round", "радиус"], ["flat", "45°"]])]),
    row("Скругл. углов", [...rangeIn("corner", 0, 60, 0.5), "мм"]),
    row("Неровн. граней", [...rangeIn("irregular", 0, 30, 0.5), "мм"]),
    row("Сколы", [...rangeIn("chip", 0, 15, 0.25), "мм"]),
  ]),
  group("Поверхность", [
    row("Рельеф", [...rangeIn("relief", 0, 10, 0.05), "мм"]),
    row("Масштаб рельефа", [...rangeIn("reliefScale", 1, 200, 1), "мм"]),
    row("Наклон", [...rangeIn("tilt", 0, 10, 0.1), "мм"]),
    row("Перепад", [...rangeIn("lift", 0, 10, 0.1), "мм"]),
    row("Зерно", [...rangeIn("grain", 0, 30, 0.5), "%"]),
    row("Пятна", [...rangeIn("mottle", 0, 30, 0.5), "%"]),
    row("Крапины", [...rangeIn("speck", 0, 100, 1)]),
    row("Контраст крапин", [...rangeIn("speckContrast", 0, 100, 1), "%"]),
    row("Темнее у кромки", [...rangeIn("edgeDark", 0, 50, 1), "%"]),
  ]),
  group("Шов", [
    row("Цвет", [colorIn("jointColor")]),
    row("Глубина", [...rangeIn("jointDepth", 0, 40, 0.5), "мм"]),
    row("Roughness", [...rangeIn("jointRough", 0, 1, 0.01)]),
  ]),
  group("Карты", [
    row("Сила нормали", [...rangeIn("normalStrength", 0, 5, 0.05)]),
    row("AO в Diffuse", [...rangeIn("ao", 0, 100, 1), "%"]),
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
  ]),
);

// панель превью
const modeBtns = VIEW_MODES.map(([m, t]) => h("button", { class: "btn pv-mode", onclick: () => { viewer.mode = m; modeBtns.forEach((b, i) => b.classList.toggle("active", VIEW_MODES[i][0] === m)); viewer.draw(); } }, t));
const repBtns = [1, 2, 3].map((n) => h("button", { class: "btn pv-rep", onclick: () => { viewer.rep = n; repBtns.forEach((b, i) => b.classList.toggle("active", i + 1 === n)); viewer.resetView(); } }, n + "×" + n));
const lightAz = h("input", { type: "range", class: "slider", min: 0, max: 360, step: 1, value: 135, title: "азимут света" });
const lightEl = h("input", { type: "range", class: "slider", min: 3, max: 90, step: 1, value: 35, title: "высота света" });
const gridCb = h("input", { type: "checkbox" });
const canvasWrap = h("div", { class: "pv-canvas-wrap" }, canvas, busy);
root.append(h("div", { class: "pv-layout" }, side, split, h("div", { class: "pv-main" },
  h("div", { class: "pv-toolbar" }, modeBtns, h("span", { class: "pv-sep" }), repBtns, h("span", { class: "pv-sep" }),
    h("label", { class: "pv-check" }, gridCb, "границы тайла"), h("span", { class: "pv-sep" }),
    h("span", { class: "hint" }, "свет"), lightAz, lightEl,
    h("button", { class: "btn", onclick: () => viewer.resetView() }, "Сброс вида")),
  canvasWrap,
  h("div", { class: "group pv-checks-group" }, h("div", { class: "group-title" }, "Проверки правил"), checksBox),
)));

// ширина панели настроек: перетаскивание разделителя, запоминается
function setSideWidth(w) {
  const max = Math.max(320, root.getBoundingClientRect().width - 320);
  w = Math.round(Math.max(260, Math.min(max, w)));
  side.style.width = w + "px";
  return w;
}
{
  const saved = +store(SIDE_KEY);
  if (saved) setSideWidth(saved);
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
    store(SIDE_KEY, String(Math.round(side.getBoundingClientRect().width)));
  };
  split.addEventListener("pointerup", end);
  split.addEventListener("pointercancel", end);
  split.addEventListener("dblclick", () => { side.style.width = ""; store(SIDE_KEY, ""); });
}

// ───────── материалы ─────────
function buildMaterials() {
  matBox.textContent = "";
  P.materials.forEach((m, i) => {
    const upd = (k, v, d) => { m[k] = v; save(); schedule(d); };
    const color = (k) => {
      const c = h("input", { type: "color", class: "pv-color", value: m[k] || "#2f3a4a" });
      c.addEventListener("input", () => upd(k, c.value, 250));
      return c;
    };
    const nIn = (k, min, max, step, w, title) => {
      const e = h("input", { type: "number", class: "num", min, max, step, title, style: `width:${w}px` });
      e.value = m[k] == null ? 0 : m[k];
      e.addEventListener("input", () => { if (e.value !== "" && Number.isFinite(+e.value)) upd(k, +e.value); });
      return e;
    };
    const metal = h("input", { type: "checkbox", title: "металл (B = 1)" });
    metal.checked = m.metal >= 0.5;
    metal.addEventListener("change", () => upd("metal", metal.checked ? 1 : 0));
    const weight = h("span", { class: "pv-weight" }, "доля", nIn("weight", 0, 100, 0.5, 40, "доля в смеси"));
    shows.push([weight, (p) => p.colorMode === "mix"]);
    const decor = h("select", { class: "sel", title: "рисунок на элементе (пэчворк)" }, DECORS.map(([v, t]) => h("option", { value: v }, t)));
    decor.value = m.decor || "none";
    decor.addEventListener("change", () => { upd("decor", decor.value); buildMaterials(); });
    matBox.append(h("div", { class: "pv-mat" },
      h("div", { class: "row" },
        h("b", {}, i + 1), color("color"),
        h("span", { class: "hint" }, "±"), nIn("vary", 0, 50, 0.5, 38, "вариация тона по элементам, %"),
        h("span", { class: "hint" }, "R"), nIn("rough", 0, 1, 0.01, 44, "roughness"),
        h("span", { class: "hint" }, "E"), nIn("emit", 0, 1, 0.05, 38, "emissive"),
        h("label", { class: "pv-check", title: "metallic 0/1" }, metal, "M"),
        weight,
        P.materials.length > 1 ? h("button", { class: "btn pv-x", title: "удалить", onclick: () => { P.materials.splice(i, 1); P.paint = null; save(); buildMaterials(); schedule(0); } }, "✕") : null),
      h("div", { class: "row pv-mat2" },
        h("span", { class: "hint", title: "выступ над плоскостью, мм (рельефная кладка)" }, "выступ"), nIn("raise", -50, 100, 0.5, 44, "выступ, мм"),
        h("span", { class: "hint", title: "перепад по ширине элемента, мм (наклонный кирпич)" }, "наклон"), nIn("slope", -100, 100, 0.5, 44, "наклон, мм"),
        h("span", { class: "hint" }, "декор"), decor, m.decor && m.decor !== "none" ? color("decorColor") : null),
    ));
  });
  paintSel.textContent = "";
  P.materials.forEach((m, i) => paintSel.append(h("option", { value: i + 1 }, "материал " + (i + 1))));
  paintMat = Math.min(paintPref, P.materials.length);
  paintSel.value = paintMat;
  updateShows();
}
paintSel.addEventListener("change", () => (paintMat = paintPref = +paintSel.value));
function addMat() {
  if (P.materials.length >= MAX_MAT) return;
  const lastM = P.materials[P.materials.length - 1];
  P.materials.push(Object.assign({}, lastM, { color: "#b0aea8", raise: 0, slope: 0, decor: "none" }));
  save(); buildMaterials(); schedule(0);
}

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
const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
let job = 0, running = false, pending = false, timer = 0;
function snapshot() { return JSON.parse(JSON.stringify(P)); }
function schedule(delay) {
  clearTimeout(timer);
  timer = setTimeout(runPreview, delay == null ? 120 : delay);
}
function runPreview() {
  if (running) { pending = true; return; }
  running = true;
  busy.textContent = "генерация…";
  busy.style.display = "block";
  worker.postMessage({ job: ++job, params: snapshot(), N: P.previewRes, mode: "preview" });
}
worker.onmessage = (e) => {
  const m = e.data;
  if (m.progress) { busy.textContent = `${m.stage} ${Math.round(m.frac * 100)} %`; return; }
  running = false;
  if (pending) { pending = false; runPreview(); } else busy.style.display = "none";
  if (!m.ok) { checksBox.textContent = ""; checksBox.append(h("div", { class: "pv-chk err" }, "✗ Ошибка: " + m.error)); setStatus("Мощение: ошибка — " + m.error); return; }
  last = m;
  if (P.paint && P.paint.sig !== m.sig) {
    P.paint = null; save();
    setStatus("Мощение: раскладка изменилась — ручная роспись сброшена");
  }
  viewer.setMaps(m.N, m);
  renderChecks(m.checks);
  fitBox.textContent = `${m.info.countText}\n${m.info.elemText}`;
  paintInfo.textContent = m.info.painted ? ` · вручную: ${m.info.painted}` : "";
  const err = m.checks.find((c) => /^Правило:/.test(c.text));
  rulesErr.textContent = err ? err.text : "";
  setStatus(`Мощение: превью ${m.N} px · ${m.info.cells} элементов · ${m.info.ms} мс`);
};
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
  for (const k of ["previewRes", "base", "udim", "suffix", "presetName"]) delete p[k];
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
buildMaterials();
buildGallery();
updateShows();
updateNames();
schedule(0);
