// Швы: заполнение (материал) и профиль (форма поперечного сечения), схемы-миниатюры профилей.
// Профиль: h(X, D, ch) — высота поверхности шва, мм, относительно лица элемента (0 — вровень, < 0 — утоплен).
// X ∈ [−1, 1] поперёк шва: −1 — кромка верхнего (левого) элемента, +1 — нижнего (правого), 0 — середина.
// asym — профиль несимметричный (для горизонтальных швов; в вертикальных берётся симметричное среднее).
// ov — нахлёст на лицо элементов, мм (нащельник, «плачущий» шов); insert — металлическая вставка |X| < insert.

// ───── заполнения шва ─────
// tex — CC0-набор (как у материалов), scale — мм на повтор; grain — зерно процедурной смеси; r — roughness.
export const JOINT_FILLS = [
  { id: "cement", name: "Цементная затирка", desc: "Классическая минеральная смесь на цементе (Ceresit CE 40, Mapei Keracolor).", r: 0.92, grain: 0.10, profile: "concave",
    colors: [["белый", "#e4e2dc"], ["светло-серый", "#bdbab3"], ["серый", "#8e8b85"], ["антрацит", "#45464a"], ["бежевый", "#c8b99c"], ["коричневый", "#6d5646"]] },
  { id: "epoxy", name: "Эпоксидная затирка", desc: "Двухкомпонентная, водонепроницаемая, не впитывает грязь (Litochrom Starlike).", r: 0.35, grain: 0.02, profile: "flush",
    colors: [["белый", "#eceae6"], ["серый", "#9a9894"], ["чёрный", "#232425"], ["бежевый", "#d2c3a6"], ["перламутр", "#d9d6cf"]] },
  { id: "pu_grout", name: "Полиуретановая затирка", desc: "Эластичная готовая затирка, не трескается при вибрациях.", r: 0.6, grain: 0.04, profile: "flush",
    colors: [["светло-серый", "#c2c0ba"], ["серый", "#8f8d88"], ["графит", "#4a4b4d"], ["песочный", "#c9b48f"]] },
  { id: "silicone", name: "Силиконовый герметик", desc: "Санитарный, эластичный, с противогрибковыми добавками — углы, ванны, раковины.", r: 0.15, grain: 0.0, profile: "concave",
    colors: [["белый", "#f0f0ee"], ["прозрачный", "#cfd3d0"], ["серый", "#9b9c9b"], ["чёрный", "#1f2021"]] },
  { id: "pu_sealant", name: "Полиуретановый герметик", desc: "Высокопрочный (SikaFlex) для деформационных швов террас и фасадов.", r: 0.4, grain: 0.01, profile: "backer_rod",
    colors: [["серый", "#7f8182"], ["бетон", "#a3a29e"], ["чёрный", "#252627"], ["белый", "#e6e6e3"]] },
  { id: "trass", name: "Клинкерный раствор с трассом", desc: "Грубый шовный раствор для клинкера (Quick-Mix FM), защищает от высолов.", tex: "Concrete003", scale: 400, r: 0.95, grain: 0.18, profile: "concave",
    colors: [["светло-серый", "#bdb9b0"], ["серый", "#8d8a84"], ["антрацит", "#4b4b4c"], ["песочный", "#c4b08a"], ["белый", "#ddd9cf"]] },
  { id: "polymer_sand", name: "Полимерный песок", desc: "Дренажный шов брусчатки: схватывается после проливки, пропускает воду.", tex: "Gravel036S", scale: 140, r: 0.95, grain: 0.25, profile: "raked",
    colors: [["серый", "#8c8a85"], ["бежевый", "#b8a582"], ["базальт", "#4c4c4d"]] },
  { id: "stone_mortar", name: "Каменный шов на растворе", desc: "Цементно-песчаный раствор между плитняком, расшивка под полукруг.", tex: "Concrete025", scale: 500, r: 0.95, grain: 0.2, profile: "concave",
    colors: [["серый", "#8f8c86"], ["светло-серый", "#b6b2aa"], ["тёплый", "#a39380"]] },
  { id: "acrylic", name: "Акриловый «тёплый шов»", desc: "Пластичный шов для деревянных домов, тянется вместе с деревом.", r: 0.7, grain: 0.03, profile: "concave",
    colors: [["белый", "#e7e5e0"], ["сосна", "#c79a62"], ["орех", "#6e4b33"], ["серый", "#8e8b86"]] },
  { id: "grass", name: "Газонный (живой) шов", desc: "Плодородный грунт с семенами низкорослой травы между крупными плитами.", tex: "Grass004", scale: 400, r: 0.85, grain: 0.3, profile: "raked",
    colors: [["трава", "#5f7d36"], ["мох", "#4d6a2b"], ["сухая трава", "#8a8048"]] },
];
export const FILL_BY_ID = Object.fromEntries(JOINT_FILLS.map((f) => [f.id, f]));

// ───── профили шва ─────
const sq = (v) => Math.sqrt(Math.max(0, v));
const bump = (x, c, w) => sq(1 - ((x - c) / w) ** 2); // полукруг радиуса w с центром c (0 вне)
export const PROFILE_GROUPS = [
  ["concave", "Вогнутые и заглублённые"], ["flat", "Плоские и наклонные"], ["convex", "Выпуклые"],
  ["deco", "Декоративные"], ["tech", "Деформационные"], ["land", "Ландшафтные и гидротехнические"],
];
export const JOINT_PROFILES = [
  { id: "concave", g: "concave", name: "Вогнутый полукруглый", desc: "Классический круглый желоб, расшивка круглой расшивкой — самый влагозащитный.", h: (X, D) => -D * sq(1 - X * X) },
  { id: "raked", g: "concave", name: "Заглублённый П-образный", desc: "Раствор вынут на 2–5 мм перпендикулярно лицу — глубокие графичные тени.", h: (X, D) => -D },
  { id: "raked_bevel", g: "concave", name: "Заглублённый со скосом", desc: "Прямоугольный паз, нижняя стенка под наклоном — вода стекает наружу.", asym: true, h: (X, D) => (X <= 0.15 ? -D : -D * (1 - (X - 0.15) / 0.85)) },
  { id: "v_groove", g: "concave", name: "V-образный вогнутый", desc: "Шов вдавлен под углом с двух сторон — острое треугольное углубление.", h: (X, D) => -1.3 * D * (1 - Math.abs(X)) },
  { id: "drip", g: "concave", name: "Каплевидный вогнутый", desc: "Асимметричный желоб: нижний радиус больше верхнего — сброс капель.", asym: true, h: (X, D) => (X < -0.35 ? -D * sq(1 - ((X + 0.35) / 0.65) ** 2) : -D * sq(1 - ((X + 0.35) / 1.35) ** 2)) },
  { id: "tunnel", g: "concave", name: "Дугообразный глубокий (тоннельный)", desc: "Утрированный полукруг, уходящий глубоко внутрь стыка.", h: (X, D) => -2.4 * D * Math.pow(sq(1 - X * X), 0.55) },
  { id: "flush", g: "flat", name: "Заподлицо (вподрезку)", desc: "Раствор срезан вровень с материалом — без теней, монолитная плоскость.", h: () => -0.2 },
  { id: "weathered", g: "flat", name: "Односрезный косой (Weathered)", desc: "Верх утоплен, низ вровень с кромкой — лучше всего сбрасывает дождь.", asym: true, h: (X, D) => -D * (1 - X) / 2 },
  { id: "struck", g: "flat", name: "Обратный косой (Struck)", desc: "Верх вровень, низ утоплен — необычная нижняя тень, только для интерьера.", asym: true, h: (X, D) => -D * (1 + X) / 2 },
  { id: "double_bevel", g: "flat", name: "Двухсрезный «домиком» внутрь", desc: "Срезы с верхней и нижней грани к центру — ребро в глубине шва.", h: (X, D) => -0.15 * D - 0.85 * D * (1 - Math.abs(X)) },
  { id: "bead", g: "convex", name: "Выпуклый полукруглый (валик)", desc: "Полукруглая полоса наружу — реставрация исторических зданий.", h: (X, D) => (Math.abs(X) < 0.7 ? D * bump(X, 0, 0.7) : -0.2) },
  { id: "raised_rect", g: "convex", name: "Выпуклый прямоугольный", desc: "Раствор выдавлен ровным «бруском» за плоскость стены.", h: (X, D) => (Math.abs(X) < 0.85 ? D * 0.8 : -0.2) },
  { id: "raised_v", g: "convex", name: "Выпуклый V-образный", desc: "Шов выступает острым треугольным ребром «домиком» вперёд.", h: (X, D) => D * (1 - Math.abs(X)) },
  { id: "weeping", g: "convex", name: "Плачущий (Weeping)", desc: "Излишки раствора не подрезаны и волнами свисают из шва вниз — рустик, лофт.", asym: true, ov: 0.9, h: (X, D, ch, n) => D * (0.35 + 0.65 * n) * sq(1 - X * X * 0.6) },
  { id: "double_bead", g: "convex", name: "Двойной валик (греческий)", desc: "Два параллельных маленьких выпуклых полукруга на одном шве.", h: (X, D) => Math.max(-0.2, 0.7 * D * Math.max(bump(X, -0.45, 0.4), bump(X, 0.45, 0.4))) },
  { id: "groove_bead", g: "deco", name: "Желобчатый с валиком", desc: "По краям вогнутый полукруг, в центре тонкий выступающий валик.", h: (X, D) => Math.max(-0.7 * D * sq(1 - X * X), 0.45 * D * bump(X, 0, 0.22) - 0.05 * D) },
  { id: "ribbon", g: "deco", name: "Ленточный (ступенчатый)", desc: "Плоский шов, из центра выступает ровная прямоугольная лента.", h: (X, D) => (Math.abs(X) < 0.42 ? 0.6 * D : -0.2) },
  { id: "chamfer", g: "deco", name: "Фасочный треугольный", desc: "Затирка до начала фаски — аккуратный скошенный стык плитки с фаской.", h: (X, D, ch) => -Math.max(0.2, ch) },
  { id: "brass_shadow", g: "deco", name: "Теневой с латунной вставкой", desc: "Глубокий шов, в глубине вклеен латунный Т/П-профиль.", insert: 0.38, h: (X, D) => (Math.abs(X) < 0.38 ? -1.1 * D : -2.6 * D) },
  { id: "backer_rod", g: "tech", name: "Компенсационный (с вилатермом)", desc: "Шнур из вспененного полиэтилена, сверху герметик — упругая вогнутая мембрана.", h: (X, D) => -0.6 * D - 0.4 * D * (1 - X * X) },
  { id: "zigzag", g: "tech", name: "Зигзагообразный (сейсмический)", desc: "Ломаная линия стыка блоков, предотвращает сквозное разрушение при вибрациях.", zig: true, h: (X, D) => -0.5 * D * sq(1 - X * X) },
  { id: "tongue_groove", g: "tech", name: "Шпунтованный (паз-гребень)", desc: "Скрытый профиль: элемент заходит в соседний; на лице — узкий плотный стык.", h: () => -0.3 },
  { id: "cover_strip", g: "tech", name: "С нащельником (Т/Н-накладка)", desc: "Шов закрыт наружной металлической накладкой.", ov: 5, cover: true, h: (X) => 2.2 * sq(1 - Math.pow(Math.abs(X), 8)) },
  { id: "drainage", g: "land", name: "Дренажный конусообразный", desc: "Шов расширяется книзу — вода мгновенно уходит в песчано-гравийную подушку.", h: (X, D) => -2.2 * D },
  { id: "dovetail", g: "land", name: "Замковый «ласточкин хвост»", desc: "Сложная геометрия внутри кладки заклинивает блоки под давлением воды.", h: () => -0.3 },
];
export const PROFILE_BY_ID = Object.fromEntries(JOINT_PROFILES.map((p) => [p.id, p]));

// ───── схема профиля (SVG, минималистичный чертёж) ─────
// Разрез: лицо сверху, слева верхний/левый элемент, справа нижний/правый, шов посередине.
export function profileSVG(p, fillColor) {
  const W = 120, H = 84, face = 30, gap = 26, x0 = (W - gap) / 2, x1 = x0 + gap, D = 9, ch = 3, base = 74;
  const ink = "#2b2f33", hatch = "url(#hp)", mortar = fillColor || "#c9c4b8";
  const pt = (X, h) => [x0 + ((X + 1) / 2) * gap, face - h];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<defs><pattern id="hp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#9aa0a6" stroke-width="1"/></pattern>` +
    `<pattern id="dp" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.6" fill="#7a756b"/></pattern></defs>` +
    `<rect width="${W}" height="${H}" fill="#f3f2ee"/>`;
  const block = (xa, xb, left) => {
    const c = left ? `${xa},${face} ${xb - ch},${face} ${xb},${face + ch} ${xb},${base} ${xa},${base}` : `${xa + ch},${face} ${xb},${face} ${xb},${base} ${xa},${base} ${xa},${face + ch}`;
    return `<polygon points="${c}" fill="${hatch}" stroke="${ink}" stroke-width="1.2"/>`;
  };
  if (p.zig) { // план: зигзаг стыка сверху
    const pts = [];
    for (let i = 0; i <= 8; i++) pts.push(`${W / 2 + (i % 2 ? 7 : -7)},${8 + i * 8.5}`);
    s += `<polygon points="6,6 ${W / 2 - 9},6 ${pts.map((q) => q.replace(/^([\d.]+)/, (v) => +v - 3)).join(" ")} ${W / 2 - 9},76 6,76" fill="${hatch}" stroke="${ink}" stroke-width="1.2"/>`;
    s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${mortar}" stroke-width="5"/><polyline points="${pts.join(" ")}" fill="none" stroke="${ink}" stroke-width="0.6" stroke-dasharray="2 2"/>`;
    s += `<text x="${W - 6}" y="80" font-size="8" text-anchor="end" fill="${ink}" font-family="sans-serif">план</text></svg>`;
    return s;
  }
  if (p.id === "tongue_groove" || p.id === "dovetail") { // разрез стыка внутри кладки
    const mid = W / 2;
    const left = p.id === "tongue_groove"
      ? `8,${face} ${mid - 2},${face} ${mid - 2},44 ${mid + 9},44 ${mid + 9},58 ${mid - 2},58 ${mid - 2},${base} 8,${base}`
      : `8,${face} ${mid - 2},${face} ${mid - 2},42 ${mid + 10},36 ${mid + 10},64 ${mid - 2},58 ${mid - 2},${base} 8,${base}`;
    const right = p.id === "tongue_groove"
      ? `${mid + 1},${face} ${W - 8},${face} ${W - 8},${base} ${mid + 1},${base} ${mid + 1},61 ${mid + 12},61 ${mid + 12},41 ${mid + 1},41`
      : `${mid + 1},${face} ${W - 8},${face} ${W - 8},${base} ${mid + 1},${base} ${mid + 1},61 ${mid + 13},67 ${mid + 13},33 ${mid + 1},39`;
    s += `<polygon points="${left}" fill="${hatch}" stroke="${ink}" stroke-width="1.2"/><polygon points="${right}" fill="${hatch}" stroke="${ink}" stroke-width="1.2"/>`;
    s += `<rect x="${mid - 2}" y="${face}" width="3" height="${base - face}" fill="${mortar}"/></svg>`;
    return s;
  }
  const ov = p.ov ? (p.cover ? 14 : 10) : 0;
  s += block(4, x0, true) + block(x1, W - 4, false);
  // наполнитель: кривая профиля сверху, низ — основание
  const N = 40, top = [];
  for (let i = 0; i <= N; i++) {
    const X = -1 + (2 * i) / N;
    top.push(pt(X, p.h(X, D, ch, 0.7 + 0.3 * Math.sin(i * 1.7))));
  }
  if (p.cover) {
    s += `<polygon points="${x0},${face + 6} ${x0},${base} ${x1},${base} ${x1},${face + 6}" fill="${mortar}" stroke="${ink}" stroke-width="0.8"/>`;
    s += `<path d="M${x0 - ov},${face} h${gap + 2 * ov} v-4 h-${gap + 2 * ov} z M${W / 2 - 2},${face} v10 h4 v-10 z" fill="#b9bec4" stroke="${ink}" stroke-width="1"/>`;
  } else {
    let d = `M${x0},${base} L${top.map((q) => q.join(",")).join(" L")} L${x1},${base} Z`;
    if (p.id === "weeping") d = `M${x0},${base} L${top.map((q) => q.join(",")).join(" L")} C${x1 + 6},${face - 6} ${x1 + 10},${face + 2} ${x1 + 8},${face + 12} L${x1},${face + 10} L${x1},${base} Z`;
    if (p.id === "drainage") d = `M${x0 - 1},${face + 2 * D} L${x1 + 1},${face + 2 * D} L${x1 + 7},${base} L${x0 - 7},${base} Z`;
    s += `<path d="${d}" fill="${mortar}" stroke="${ink}" stroke-width="1"/><path d="${d}" fill="url(#dp)" opacity="0.6"/>`;
    if (p.id === "backer_rod") s += `<circle cx="${W / 2}" cy="${face + D + 9}" r="${gap / 2 - 2}" fill="#e9e3c7" stroke="${ink}" stroke-width="1"/>`;
    if (p.insert) s += `<path d="M${x0 + gap * 0.31},${face + 1.1 * D} h${gap * 0.38} v3 h-${gap * 0.14} v14 h-${gap * 0.1} v-14 h-${gap * 0.14} z" fill="#c9a24e" stroke="${ink}" stroke-width="0.8"/>`;
  }
  // линия лица и стрелка «верх» для несимметричных
  s += `<line x1="2" y1="${face}" x2="${W - 2}" y2="${face}" stroke="${ink}" stroke-width="0.6" stroke-dasharray="3 2" opacity="0.6"/>`;
  if (p.asym) s += `<text x="6" y="12" font-size="8" fill="${ink}" font-family="sans-serif">↑ верх</text>`;
  return s + "</svg>";
}
