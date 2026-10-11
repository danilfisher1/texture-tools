// Пресеты материалов покрытия (по легенде листа благоустройства) — частичные наборы параметров поверх DEFAULTS.

const M = (color, vary, rough, weight, extra) => Object.assign({ color, vary, rough, metal: 0, emit: 0, weight: weight || 1 }, extra);
export const PRESETS = [
  {
    name: "Плитка Тип 1 «Профи» 300×100, серый + белые вставки",
    p: {
      layout: "running", offset: "1/2", ex: 100, ey: 300, joint: 3, countX: 40, countY: 16, jitter: 0,
      chamfer: 2, profile: "round", corner: 0, irregular: 0, chip: 0, relief: 0.15, reliefScale: 6, tilt: 0.3, lift: 0.2,
      grain: 3.5, mottle: 1.2, speck: 8, speckContrast: 18, edgeDark: 12, jointColor: "#4d4a45", jointDepth: 3, jointRough: 0.95, ao: 50,
      materials: [M("#6e7070", 4, 0.84, 3), M("#cecfcb", 4, 0.84, 1)],
      colorMode: "rules", rules: "4 1 >-1     # ряд A: 4 серые, белая, 1 серая, белая…\n-           # серый\n4 2 3 >-1   # ряд B: 4 серые, белая, 2, белая, 3…\n-           # серый",
      base: "T_Tile1_Profi_Grey",
    },
  },
  {
    name: "Плитка Тип 2 «Профи» 300×100, светло-серый",
    p: {
      layout: "running", offset: "1/2", ex: 100, ey: 300, joint: 3, countX: 0, countY: 0, chamfer: 2, profile: "round",
      relief: 0.15, reliefScale: 6, tilt: 0.3, lift: 0.2, grain: 3.5, mottle: 1.2, speck: 8, speckContrast: 15, edgeDark: 10,
      jointColor: "#57544e", jointDepth: 3, ao: 50, materials: [M("#a5a6a2", 4, 0.82)], colorMode: "single", base: "T_Tile2_Profi_LightGrey",
    },
  },
  {
    name: "Брусчатка колотая, гранит красный 100×100",
    p: {
      layout: "running", offset: "rand", ex: 100, ey: 100, joint: 7, countX: 36, countY: 36, jitter: 14,
      chamfer: 5, profile: "round", corner: 6, irregular: 3, chip: 1.5, relief: 2.2, reliefScale: 14, tilt: 3, lift: 1.5,
      grain: 5, mottle: 3, speck: 55, speckContrast: 45, edgeDark: 15, jointColor: "#4d433c", jointDepth: 12, jointRough: 0.95, ao: 80,
      materials: [M("#995750", 12, 0.72)], colorMode: "single", base: "T_Cobble_Granite_Red",
    },
  },
  {
    name: "Бетонные плиты 600×300, светло-серый",
    p: {
      layout: "running", offset: "1/2", ex: 600, ey: 300, joint: 4, countX: 0, countY: 0, chamfer: 3, profile: "round",
      relief: 0.2, reliefScale: 10, tilt: 0.8, lift: 0.5, grain: 3.5, mottle: 1.5, speck: 10, speckContrast: 15, edgeDark: 10,
      jointColor: "#56534d", jointDepth: 5, ao: 55, materials: [M("#a3a4a0", 5, 0.85)], colorMode: "single", base: "T_Slab_600x300",
    },
  },
  {
    name: "Плитняк серый, нерегулярный",
    p: {
      layout: "voronoi", ex: 450, joint: 18, countX: 0, jitter: 90, relax: 2, chamfer: 8, profile: "round", corner: 20,
      irregular: 10, chip: 5, relief: 3, reliefScale: 40, tilt: 4, lift: 3, grain: 5, mottle: 4, speck: 20, speckContrast: 20,
      edgeDark: 15, jointColor: "#5b5850", jointDepth: 15, ao: 80, materials: [M("#8e8d87", 15, 0.8)], colorMode: "single", base: "T_Flagstone_Grey",
    },
  },
  {
    name: "Ёлочка 45°, 200×100, смесь двух серых",
    p: {
      layout: "herring45", ex: 200, ey: 100, joint: 3, countX: 0, countY: 0, chamfer: 2, profile: "round", relief: 0.15, tilt: 0.4,
      lift: 0.3, grain: 3.5, mottle: 1.2, speck: 8, edgeDark: 12, jointColor: "#4d4a45", jointDepth: 4, ao: 55,
      materials: [M("#7a7a76", 4, 0.84, 3), M("#55524d", 4, 0.86, 1)], colorMode: "mix", base: "T_Herringbone45",
    },
  },
  {
    name: "Ёлочка 90°, клинкер 200×100",
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
