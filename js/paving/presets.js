// Пресеты: частичные наборы параметров поверх DEFAULTS, разложены по вкладкам галереи.
// thumb — сторона плоскости миниатюры, мм (по умолчанию 1000 = 1 × 1 м).

const M = (color, vary, rough, weight, extra) =>
  Object.assign({ color, vary, rough, metal: 0, emit: 0, weight: weight || 1, raise: 0, slope: 0, decor: "none", decorColor: "#2f3a4a" }, extra);

export const PRESET_TABS = [["paving", "Мощение"], ["brick", "Кирпич"]];

// ───────── мощение: материалы покрытия по легенде листа ─────────
const PAVING = [
  {
    name: "Плитка Тип 1 «Профи» 300×100, белые вставки",
    p: {
      layout: "running", offset: "1/2", ex: 100, ey: 300, joint: 3, countX: 40, countY: 16, jitter: 0,
      chamfer: 2, profile: "round", corner: 0, irregular: 0, chip: 0, relief: 0.15, reliefScale: 6, tilt: 0.3, lift: 0.2,
      grain: 3.5, mottle: 1.2, speck: 8, speckContrast: 18, edgeDark: 12, jointColor: "#4d4a45", jointDepth: 3, jointRough: 0.95, ao: 50,
      materials: [M("#6e7070", 4, 0.84, 3), M("#cecfcb", 4, 0.84, 1)],
      colorMode: "rules", noTouch: true, rules: "4 1 >-1     # ряд A: 4 серые, белая, 1 серая, белая…\n-           # серый\n4 2 3 >-1   # ряд B: 4 серые, белая, 2, белая, 3…\n-           # серый",
      base: "T_Tile1_Profi_Grey",
    },
  },
  {
    name: "Плитка Тип 2 «Профи» 300×100",
    p: {
      layout: "running", offset: "1/2", ex: 100, ey: 300, joint: 3, countX: 0, countY: 0, chamfer: 2, profile: "round",
      relief: 0.15, reliefScale: 6, tilt: 0.3, lift: 0.2, grain: 3.5, mottle: 1.2, speck: 8, speckContrast: 15, edgeDark: 10,
      jointColor: "#57544e", jointDepth: 3, ao: 50, materials: [M("#a5a6a2", 4, 0.82)], colorMode: "single", base: "T_Tile2_Profi_LightGrey",
    },
  },
  {
    name: "Брусчатка колотая 100×100",
    p: {
      layout: "running", offset: "rand", ex: 100, ey: 100, joint: 7, countX: 36, countY: 36, jitter: 14,
      chamfer: 5, profile: "round", corner: 6, irregular: 3, chip: 1.5, relief: 2.2, reliefScale: 14, tilt: 3, lift: 1.5,
      grain: 5, mottle: 3, speck: 55, speckContrast: 45, edgeDark: 15, jointColor: "#4d433c", jointDepth: 12, jointRough: 0.95, ao: 80,
      materials: [M("#995750", 12, 0.72)], colorMode: "single", base: "T_Cobble_Granite_Red",
    },
  },
  {
    name: "Бетонные плиты 600×300", thumb: 2000,
    p: {
      layout: "running", offset: "1/2", ex: 600, ey: 300, joint: 4, countX: 0, countY: 0, chamfer: 3, profile: "round",
      relief: 0.2, reliefScale: 10, tilt: 0.8, lift: 0.5, grain: 3.5, mottle: 1.5, speck: 10, speckContrast: 15, edgeDark: 10,
      jointColor: "#56534d", jointDepth: 5, ao: 55, materials: [M("#a3a4a0", 5, 0.85)], colorMode: "single", base: "T_Slab_600x300",
    },
  },
  {
    name: "Плитняк нерегулярный", thumb: 2000,
    p: {
      layout: "voronoi", ex: 450, joint: 18, countX: 0, jitter: 90, relax: 2, chamfer: 8, profile: "round", corner: 20,
      irregular: 10, chip: 5, relief: 3, reliefScale: 40, tilt: 4, lift: 3, grain: 5, mottle: 4, speck: 20, speckContrast: 20,
      edgeDark: 15, jointColor: "#5b5850", jointDepth: 15, ao: 80, materials: [M("#8e8d87", 15, 0.8)], colorMode: "single", base: "T_Flagstone_Grey",
    },
  },
  {
    name: "Ёлочка 45° 200×100, два тона",
    p: {
      layout: "herring45", ex: 200, ey: 100, joint: 3, countX: 0, countY: 0, chamfer: 2, profile: "round", relief: 0.15, tilt: 0.4,
      lift: 0.3, grain: 3.5, mottle: 1.2, speck: 8, edgeDark: 12, jointColor: "#4d4a45", jointDepth: 4, ao: 55,
      materials: [M("#7a7a76", 4, 0.84, 3), M("#55524d", 4, 0.86, 1)], colorMode: "mix", base: "T_Herringbone45",
    },
  },
  {
    name: "Ёлочка 90° 200×100",
    p: {
      layout: "herring90", ex: 200, ey: 100, joint: 6, countX: 0, chamfer: 1.5, profile: "round", relief: 0.4, reliefScale: 4,
      tilt: 0.6, lift: 0.4, grain: 5, mottle: 2.5, speck: 15, speckContrast: 25, edgeDark: 15, jointColor: "#6b665d", jointDepth: 5, ao: 60,
      materials: [M("#8a4b35", 10, 0.78)], colorMode: "single", base: "T_Clinker_Herringbone",
    },
  },
  {
    name: "Корзинка 200×100",
    p: {
      layout: "basket", ex: 200, ey: 100, joint: 4, countX: 0, chamfer: 2, profile: "round", relief: 0.2, tilt: 0.5, lift: 0.3,
      grain: 3.5, mottle: 1.5, speck: 8, edgeDark: 12, jointColor: "#4d4a45", jointDepth: 4, ao: 55,
      materials: [M("#8b8a84", 5, 0.84)], colorMode: "single", base: "T_Basketweave",
    },
  },
  {
    name: "Шестигранник 200, смесь трёх тонов",
    p: {
      layout: "hex", ex: 200, joint: 4, countX: 0, countY: 0, chamfer: 3, profile: "round", relief: 0.2, tilt: 0.5, lift: 0.3,
      grain: 3.5, mottle: 1.5, speck: 8, edgeDark: 12, jointColor: "#4d4a45", jointDepth: 5, ao: 55,
      materials: [M("#8c8b85", 4, 0.84), M("#6d6c67", 4, 0.85), M("#a9a8a2", 4, 0.83)], colorMode: "mix", base: "T_Hexagon_200",
    },
  },
];

// ───────── плитка: классические и современные раскладки ─────────
const T = (o) => Object.assign({
  countX: 0, countY: 0, chamfer: 1.5, profile: "round", corner: 0, irregular: 0, chip: 0, jitter: 0, rotate: false,
  relief: 0.08, reliefScale: 5, tilt: 0.15, lift: 0.1, grain: 2, mottle: 1, speck: 0, speckContrast: 15, edgeDark: 6,
  jointColor: "#9e9a92", jointDepth: 1.5, jointRough: 0.9, ao: 35, colorMode: "single",
}, o);
const TILE = [
  { name: "1. Прямая (шов в шов) 600×600", thumb: 2000, p: T({ layout: "stack", ex: 600, ey: 600, joint: 3, materials: [M("#c9c1b2", 3, 0.55)], base: "T_Tile_Stack_600" }) },
  { name: "2. Диагональная 300×300", p: T({ layout: "diagonal", ex: 300, ey: 300, joint: 3, materials: [M("#b7b2a8", 4, 0.6)], base: "T_Tile_Diagonal_300" }) },
  { name: "3. Вразбежку 1/2, «кабанчик» 200×100", p: T({ layout: "running", offset: "1/2", ex: 200, ey: 100, joint: 2, chamfer: 4, materials: [M("#e8e6e1", 2, 0.12)], jointColor: "#d4d1ca", edgeDark: 3, base: "T_Tile_Metro_200x100" }) },
  { name: "3. Вразбежку 1/3, планка 600×150", p: T({ layout: "running", offset: "1/3", ex: 600, ey: 150, joint: 2, materials: [M("#8a7a68", 10, 0.6)], mottle: 3, base: "T_Tile_Plank_1_3" }) },
  { name: "4. Вертикальная прямая 300×75", p: T({ layout: "stack", ex: 75, ey: 300, joint: 2, chamfer: 2, materials: [M("#5d6b66", 4, 0.25)], base: "T_Tile_Vertical_Stack" }) },
  { name: "5. Вертикальная со смещением 250×60", p: T({ layout: "running", offset: "1/2", ex: 250, ey: 60, rotate: true, joint: 2, chamfer: 2, materials: [M("#2f3d4a", 5, 0.2)], jointColor: "#c9c6c0", base: "T_Tile_Vertical_Running" }) },
  { name: "6. Шахматная 250×250", p: T({ layout: "stack", ex: 250, ey: 250, joint: 2, materials: [M("#1f1f20", 2, 0.25), M("#ebe9e4", 2, 0.25)], colorMode: "rules", rules: ":12\n:21", jointColor: "#8c8a85", base: "T_Tile_Checker" }) },
  { name: "7. Шахматная под углом 300×300", p: T({ layout: "diagonal", ex: 300, ey: 300, joint: 2, materials: [M("#24252a", 2, 0.3), M("#e7e3da", 2, 0.3)], colorMode: "parts", base: "T_Tile_Checker_Diagonal" }) },
  { name: "8. Классическая ёлочка 90°, 300×100", p: T({ layout: "herring90", ex: 300, ey: 100, joint: 2, materials: [M("#9b7b5b", 9, 0.55)], mottle: 3, base: "T_Tile_Herringbone" }) },
  { name: "9. Французская ёлочка (шеврон) 45°", thumb: 1500, p: T({ layout: "chevron", ex: 600, ey: 120, angle: 45, joint: 2, materials: [M("#a0825f", 9, 0.55)], mottle: 3, base: "T_Tile_Chevron45" }) },
  { name: "9. Французская ёлочка (шеврон) 60°", p: T({ layout: "chevron", ex: 500, ey: 100, angle: 60, joint: 2, materials: [M("#7d6a58", 9, 0.55)], mottle: 3, base: "T_Tile_Chevron60" }) },
  { name: "10. Двойная ёлочка 400×100", p: T({ layout: "herring90", ex: 400, ey: 100, multi: 2, joint: 2, materials: [M("#8f8a80", 5, 0.6)], base: "T_Tile_Herringbone_Double" }) },
  { name: "10. Тройная ёлочка 45°, 450×75", p: T({ layout: "herring45", ex: 450, ey: 75, multi: 3, joint: 2, materials: [M("#b0a58f", 6, 0.6)], base: "T_Tile_Herringbone_Triple" }) },
  { name: "11. Корзинка 2 шт, 200×100", p: T({ layout: "basket", ex: 200, ey: 100, joint: 2, materials: [M("#c2bdb2", 4, 0.5), M("#a9a397", 4, 0.5)], colorMode: "parts", base: "T_Tile_Basket2" }) },
  { name: "11. Корзинка 3 шт, 300×100", p: T({ layout: "basket", ex: 300, ey: 100, joint: 2, materials: [M("#6f7b74", 4, 0.4)], base: "T_Tile_Basket3" }) },
  { name: "12. Модульная сетка (4 формата)", thumb: 2000, p: T({ layout: "modular", ex: 150, modSizes: "4x4 4x2:2 2x4:2 2x2:3", joint: 3, materials: [M("#b4ad9f", 5, 0.6)], base: "T_Tile_Modular" }) },
  { name: "12. Модульная «Старый город» (3 длины)", p: T({ layout: "modular", ex: 60, modSizes: "2x2 3x2 4x2", joint: 4, chamfer: 3, relief: 0.3, tilt: 0.6, lift: 0.4, materials: [M("#8d8a83", 6, 0.8), M("#a19b90", 6, 0.8)], colorMode: "mix", jointColor: "#5b5852", jointDepth: 4, base: "T_Tile_OldTown" }) },
  { name: "13. Ветряная мельница 300×100", p: T({ layout: "windmill", ex: 300, ey: 100, joint: 2, materials: [M("#d5d0c6", 3, 0.45), M("#3d4a5c", 3, 0.4)], colorMode: "parts", base: "T_Tile_Windmill" }) },
  { name: "14. Вертушка (гопскотч) 400 + 200", p: T({ layout: "hopscotch", ex: 400, ey: 200, joint: 2, materials: [M("#c8c2b6", 3, 0.5), M("#6d665c", 3, 0.5)], colorMode: "parts", base: "T_Tile_Hopscotch" }) },
  { name: "15. Полосы 600×300", thumb: 2000, p: T({ layout: "stack", ex: 600, ey: 300, joint: 2, materials: [M("#d9d6cf", 3, 0.5), M("#6e7378", 3, 0.5)], colorMode: "rules", rules: "=1\n=1\n=2", base: "T_Tile_Stripes" }) },
  { name: "16. Соты 200", p: T({ layout: "hex", ex: 200, joint: 2, materials: [M("#e6e3dc", 3, 0.35)], jointColor: "#7d7a74", base: "T_Tile_Hex200" }) },
  { name: "16. Соты мелкие 60, смесь", p: T({ layout: "hex", ex: 60, joint: 2, materials: [M("#2c2d30", 3, 0.3, 1), M("#e9e7e1", 3, 0.3, 2)], colorMode: "mix", jointColor: "#9a9790", base: "T_Tile_Hex60" }) },
  { name: "17. Рыбья чешуя 150", p: T({ layout: "scales", ex: 150, joint: 2, chamfer: 3, materials: [M("#3f7f86", 8, 0.12)], jointColor: "#d2cfc8", edgeDark: 10, base: "T_Tile_FishScale" }) },
  { name: "18. Ромбы 3D (кубы)", p: T({ layout: "rhombus", ex: 200, joint: 2, materials: [M("#e4e1da", 2, 0.4), M("#8e8c87", 2, 0.4), M("#3a3a3c", 2, 0.4)], colorMode: "parts", base: "T_Tile_Rhombus3D" }) },
  { name: "19. Мозаика 20×20, четыре тона", p: T({ layout: "stack", ex: 20, ey: 20, joint: 2, chamfer: 1, materials: [M("#2f6f8f", 6, 0.15, 3), M("#4d97b4", 6, 0.15, 3), M("#d9e6ea", 4, 0.15, 2), M("#1d3d55", 6, 0.15, 1)], colorMode: "mix", jointColor: "#cfcbc3", base: "T_Tile_Mosaic20" }) },
  { name: "19. Мозаика нерегулярная", p: T({ layout: "voronoi", ex: 25, joint: 2, jitter: 80, relax: 2, chamfer: 1, irregular: 0.5, materials: [M("#b98a5e", 10, 0.3, 2), M("#8e5a3c", 10, 0.3, 1), M("#d9c7a8", 8, 0.3, 2)], colorMode: "mix", jointColor: "#d8d2c6", base: "T_Tile_Mosaic_Irregular" }) },
  {
    name: "20. Калейдоскоп / пэчворк 200×200",
    p: T({
      layout: "stack", ex: 200, ey: 200, joint: 2, colorMode: "mix", jointColor: "#cdc8bd", base: "T_Tile_Patchwork",
      materials: [
        M("#e9e2d2", 3, 0.3, 1, { decor: "flower", decorColor: "#2f5d8a" }), M("#e9e2d2", 3, 0.3, 1, { decor: "truchet", decorColor: "#b5523b" }),
        M("#2f5d8a", 3, 0.3, 1, { decor: "star", decorColor: "#e9e2d2" }), M("#e9e2d2", 3, 0.3, 1, { decor: "diamond", decorColor: "#3c7a5a" }),
        M("#b5523b", 3, 0.3, 1, { decor: "ring", decorColor: "#e9e2d2" }), M("#e9e2d2", 3, 0.3, 1, { decor: "quarter", decorColor: "#2f5d8a" }),
      ],
    }),
  },
];

// ───────── кирпич: перевязки кладки (кирпич 250×120×65, шов 10 мм) ─────────
const B = (o) => Object.assign({
  layout: "bond", ex: 250, ey: 120, ez: 65, joint: 10, countX: 0, countY: 0, rotate: false,
  chamfer: 1.5, profile: "round", corner: 2, irregular: 0.8, chip: 0.6, relief: 0.6, reliefScale: 3, tilt: 0.6, lift: 0.6,
  grain: 6, mottle: 4, speck: 25, speckContrast: 25, edgeDark: 10, jointColor: "#bab5ab", jointDepth: 6, jointRough: 0.95, ao: 70,
  materials: [M("#9a4a35", 9, 0.86)], colorMode: "single",
}, o);
const RED2 = [M("#9a4a35", 8, 0.86), M("#5e2c22", 8, 0.86)];
// тычки чуть темнее ложков (обожжённые торцы) — рисунок перевязки читается
const REDH = [M("#9a4a35", 8, 0.86), M("#7f3b2b", 8, 0.86)];
const BRICK = [
  { name: "1. Ложковая (в полкирпича)", p: B({ bond: "L\nL @2", base: "T_Brick_Stretcher" }) },
  { name: "1. Ложковая со смещением 1/3", p: B({ bond: "L\nL @1.3333\nL @2.6667", base: "T_Brick_Stretcher_Third" }) },
  { name: "2. Тычковая", p: B({ bond: "T\nT @1", base: "T_Brick_Header" }) },
  { name: "3. Цепная (двухрядная)", p: B({ bond: "L\nT", materials: REDH, colorMode: "parts", base: "T_Brick_Chain" }) },
  { name: "4. Английская (блочная)", p: B({ bond: "L\nT @1", materials: REDH, colorMode: "parts", base: "T_Brick_English" }) },
  { name: "5. Фламандская", p: B({ bond: "L T\nL T @3", materials: REDH, colorMode: "parts", base: "T_Brick_Flemish" }) },
  { name: "6. Голландская", p: B({ bond: "T @1\nL T", materials: REDH, colorMode: "parts", base: "T_Brick_Dutch" }) },
  { name: "7. Готическая (польская)", p: B({ bond: "L T\nL T @3", materials: RED2, colorMode: "parts", base: "T_Brick_Gothic" }) },
  { name: "8. Силезская", p: B({ bond: "L L T\nL L T @3", materials: RED2, colorMode: "parts", base: "T_Brick_Silesian" }) },
  { name: "9. Крестовая (английская крестовая)", p: B({ bond: "L\nT @1\nL @2\nT @1", materials: REDH, colorMode: "parts", base: "T_Brick_EnglishCross" }) },
  {
    name: "10. Баварская (смесь 6 оттенков)",
    p: B({
      bond: "L\nL @2", colorMode: "mix", base: "T_Brick_Bavarian",
      materials: [M("#9a4a35", 5, 0.86, 3), M("#7d3a2a", 5, 0.86, 2), M("#5a2a20", 5, 0.86, 1), M("#a85d3f", 5, 0.86, 2), M("#3e2622", 5, 0.86, 1), M("#8a5440", 5, 0.86, 2)],
    }),
  },
  { name: "11. Хаотичная (дикая)", p: B({ bond: "?", materials: [M("#a0583f", 9, 0.86)], base: "T_Brick_Wild" }) },
  { name: "12. Колодезная (облегчённая)", p: B({ bond: "L L L T\nL L L T @7", materials: RED2, colorMode: "parts", base: "T_Brick_Well" }) },
  { name: "13. Линейная вертикальная", p: B({ bond: "S", base: "T_Brick_Vertical_Stack" }) },
  { name: "14. Солдатик (пояс)", p: B({ bond: "L\nL @2\nL\nL @2\nS", materials: RED2, colorMode: "parts", base: "T_Brick_Soldier_Course" }) },
  { name: "15. Плетёнка (паркетная)", thumb: 1200, p: B({ layout: "basket", ex: 250, ey: 120, base: "T_Brick_Basket" }) },
  { name: "16. Ёлочка 45°", thumb: 1200, p: B({ layout: "herring45", ex: 250, ey: 120, base: "T_Brick_Herringbone" }) },
  { name: "17. Дорожка (на ребро)", p: B({ bond: "R\nR @2", base: "T_Brick_Rowlock" }) },
  {
    name: "18. Рельефная (выступающие кирпичи)",
    p: B({
      bond: "L\nL @2", countX: 15, countY: 50, colorMode: "rules", rules: "4 >-1\n4 >-1", snapRows: true, base: "T_Brick_Relief",
      materials: [M("#9a4a35", 8, 0.86), M("#a3533c", 8, 0.86, 1, { raise: 18 })],
    }),
  },
  { name: "19. Перфорированная (ажурная)", p: B({ bond: "L _2\nL _2 @3", base: "T_Brick_Perforated" }) },
  {
    name: "20. Литовская «крысиный хвост»",
    p: B({ bond: "L T\nL T @3", colorMode: "parts", base: "T_Brick_RatTail", materials: [M("#9a4a35", 8, 0.86), M("#8f4430", 8, 0.86, 1, { raise: 10, slope: 22 })] }),
  },
];

// подсказки к узору: материалы слотов (id библиотеки) и шов — применяются, когда слотов не хватает
// или по кнопке «Материалы и шов из узора»; миниатюры узоров всегда нейтральные
const J = (fill, profile, depth) => ({ fill, profile, depth });
const SUGGEST = {
  "Плитка Тип 1": { slots: ["profi_grey", "profi_white"], j: J("polymer_sand", "raked", 3) },
  "Плитка Тип 2": { slots: ["profi_lightgrey"], j: J("polymer_sand", "raked", 3) },
  "Брусчатка колотая": { slots: ["pokostovsky"], j: J("polymer_sand", "raked", 8) },
  "Бетонные плиты 600": { slots: ["profi_lightgrey"], j: J("polymer_sand", "raked", 3) },
  "Плитняк": { slots: ["sandstone_grey_green"], j: J("stone_mortar", "concave", 4) },
  "Ёлочка 45° 200": { slots: ["profi_grey", "gabbro"], j: J("polymer_sand", "raked", 3) },
  "Ёлочка 90° 200": { slots: ["gotika_klinker"], j: J("polymer_sand", "raked", 3) },
  "Корзинка 200×100": { slots: ["steingot_melange"], j: J("polymer_sand", "raked", 3) },
  "Шестигранник 200": { slots: ["profi_grey", "profi_lightgrey", "gabbro"], j: J("polymer_sand", "raked", 3) },
  "1. Прямая": { slots: ["laminam"], j: J("epoxy", "flush", 0.5) },
  "2. Диагональная": { slots: ["crema_marfil"], j: J("cement", "flush", 0.5) },
  "3. Вразбежку 1/2": { slots: ["zellige"], j: J("cement", "flush", 0.5) },
  "3. Вразбежку 1/3": { slots: ["cersanit_wood"], j: J("cement", "flush", 0.5) },
  "4. Вертикальная прямая": { slots: ["zellige"], j: J("cement", "flush", 0.5) },
  "5. Вертикальная со смещением": { slots: ["bisazza"], j: J("epoxy", "flush", 0.5) },
  "6. Шахматная": { slots: ["nero_marquina", "carrara"], j: J("epoxy", "flush", 0.5) },
  "7. Шахматная под углом": { slots: ["nero_marquina", "carrara"], j: J("epoxy", "flush", 0.5) },
  "8. Классическая ёлочка": { slots: ["oak_engineered"], j: J("acrylic", "flush", 0.3) },
  "9. Французская ёлочка (шеврон) 45": { slots: ["oak_engineered"], j: J("acrylic", "flush", 0.3) },
  "9. Французская ёлочка (шеврон) 60": { slots: ["thermo_ash"], j: J("acrylic", "flush", 0.3) },
  "10. Двойная": { slots: ["oak_engineered"], j: J("acrylic", "flush", 0.3) },
  "10. Тройная": { slots: ["bamboo"], j: J("acrylic", "flush", 0.3) },
  "11. Корзинка 2": { slots: ["crema_marfil", "emperador_dark"], j: J("cement", "flush", 0.5) },
  "11. Корзинка 3": { slots: ["travertine_classico"], j: J("cement", "flush", 0.5) },
  "12. Модульная сетка": { slots: ["travertine_classico"], j: J("cement", "flush", 0.8) },
  "12. Модульная «Старый город»": { slots: ["braer_old_town", "steingot_melange"], j: J("polymer_sand", "raked", 4) },
  "13. Ветряная": { slots: ["carrara", "nero_marquina"], j: J("epoxy", "flush", 0.5) },
  "14. Вертушка": { slots: ["crema_marfil", "emperador_dark"], j: J("cement", "flush", 0.5) },
  "15. Полосы": { slots: ["microcement", "basalt"], j: J("epoxy", "flush", 0.5) },
  "16. Соты 200": { slots: ["carrara"], j: J("cement", "flush", 0.5) },
  "16. Соты мелкие": { slots: ["nero_marquina", "carrara"], j: J("epoxy", "flush", 0.5) },
  "17. Рыбья": { slots: ["zellige"], j: J("cement", "flush", 0.5) },
  "18. Ромбы": { slots: ["carrara", "polotsky", "nero_marquina"], j: J("epoxy", "flush", 0.5) },
  "19. Мозаика 20": { slots: ["bisazza"], j: J("epoxy", "flush", 0.5) },
  "19. Мозаика нерегулярная": { slots: ["smalt"], j: J("cement", "flush", 0.5) },
  "20. Калейдоскоп": { slots: ["winckelmans"], j: J("cement", "flush", 0.5) },
};
const BRICK_SLOTS = ["feldhaus", "lsr_klinker"];
function suggest(p) {
  for (const k in SUGGEST) if (p.name.startsWith(k)) return SUGGEST[k];
  return p.cat === "brick" ? { slots: BRICK_SLOTS, j: J("trass", "concave", 4) } : { slots: [], j: null };
}

export const PRESETS = [
  ...PAVING.map((p) => Object.assign({ cat: "paving" }, p)),
  ...TILE.map((p) => Object.assign({ cat: "paving" }, p)),
  ...BRICK.map((p) => Object.assign({ cat: "brick" }, p)),
].map((p) => Object.assign(p, suggest(p)));

// параметры узора, которые переносит пресет (материалы и шов выбираются отдельно)
export const PATTERN_KEYS = [
  "layout", "ex", "ey", "ez", "joint", "countX", "countY", "offset", "jitter", "relax", "rotate", "snapRows", "angle", "multi", "modSizes", "bond",
  "colorMode", "rules", "noTouch", // кромка и поверхность (фаска, сколы, рельеф…) — только в тонкой настройке, по умолчанию 0
];
