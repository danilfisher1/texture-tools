// Генератор тайловых PBR-текстур мощения: раскладка → материалы → растр → карты.
// Единицы — мм. Текстура покрывает S×S мм плоскости и имеет N×N px.
// Бесшовность по построению: раскладка замыкается на целом числе элементов/модулей,
// шум — решётка с целым периодом на S, производные и размытие — с заворотом краёв.
// Карты: Diffuse (sRGB), ERM (R = emissive, G = roughness, B = metallic 0/1), Normal DX (Y−), Height (мм).

import { MAT_BY_ID } from "./materials.js";
import { PROFILE_BY_ID, FILL_BY_ID } from "./joints.js";

const SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3);

export const LAYOUTS = [
  { id: "stack", name: "Шов в шов" },
  { id: "running", name: "Вразбежку (смещение рядов)" },
  { id: "diagonal", name: "Диагональ 45°" },
  { id: "herring90", name: "Ёлочка 90° (1–3 планки)" },
  { id: "herring45", name: "Ёлочка 45° (1–3 планки)" },
  { id: "chevron", name: "Французская ёлочка (шеврон)" },
  { id: "basket", name: "Корзинка" },
  { id: "modular", name: "Модульная (разные форматы)" },
  { id: "windmill", name: "Ветряная мельница" },
  { id: "hopscotch", name: "Вертушка (2 квадрата)" },
  { id: "hex", name: "Шестигранник (соты)" },
  { id: "rhombus", name: "Ромбы 3D (кубы)" },
  { id: "scales", name: "Рыбья чешуя" },
  { id: "voronoi", name: "Плитняк / мозаика" },
  { id: "bond", name: "Кирпичная кладка (перевязка)" },
];

export const DEFAULTS = {
  size: 3000, seed: 1,
  layout: "running", ex: 100, ey: 300, joint: 3, countX: 0, countY: 0,
  offset: "1/2", jitter: 0, relax: 1, rotate: false, snapRows: true,
  ez: 65, angle: 45, multi: 1, modSizes: "2x2 2x1 1x2 1x1", bond: "L\nL @2",
  chamfer: 0, profile: "round", chip: 0, irregular: 0, corner: 0,
  relief: 0, reliefScale: 6, tilt: 0, lift: 0,
  grain: 0, mottle: 0, speck: 0, speckContrast: 30, edgeDark: 0,
  jointFill: "cement", jointColor: "#bdbab3", jointProfile: "concave", jointRough: 0.92, jointDepth: 3,
  normalStrength: 1, ao: 50,
  materials: [
    { color: "#6e7070", vary: 4, rough: 0.84, metal: 0, emit: 0, weight: 1, raise: 0, slope: 0, decor: "none", decorColor: "#2f3a4a" },
    { color: "#cecfcb", vary: 4, rough: 0.84, metal: 0, emit: 0, weight: 1, raise: 0, slope: 0, decor: "none", decorColor: "#2f3a4a" },
  ],
  colorMode: "single", noTouch: false, jointMetal: 0,
  rules: "4 1 >-1\n-\n4 2 3 >-1\n-",
  paint: null,
};

// ───────── утилиты ─────────
function mod(a, n) { return ((a % n) + n) % n; }
function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
function lcm(a, b) { return a / gcd(a, b) * b; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function num(v, d) { v = +v; return Number.isFinite(v) ? v : d; }

export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(h || "").trim());
  const v = m ? parseInt(m[1], 16) : 0x808080;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// ───────── периодичный шум ─────────
function hashU(ix, iy, s) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(s, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1; // [-1, 1)
}

const NOISE_GAIN = 2.6; // value-noise ≈ σ 0.38 → приводим к σ ≈ 1

// value-noise с целым числом ячеек решётки P на S → бесшовно; ячейка не мельче пикселя.
// Значения решётки — таблица P×P, выборка построчно по пикселям текстуры N×N.
function octave(S, N, cell, seed) {
  const P = Math.max(1, Math.min(N, Math.round(S / Math.max(cell, (S / N) * 0.9))));
  const tab = new Float32Array(P * P);
  for (let iy = 0; iy < P; iy++) for (let ix = 0; ix < P; ix++) tab[iy * P + ix] = hashU(ix, iy, seed) * NOISE_GAIN;
  const i0 = new Int32Array(N), i1 = new Int32Array(N), w = new Float32Array(N);
  for (let p = 0; p < N; p++) {
    const u = ((p + 0.5) * P) / N, ix = Math.floor(u), fx = u - ix;
    i0[p] = ix % P; i1[p] = (ix + 1) % P; w[p] = fx * fx * (3 - 2 * fx);
  }
  return { P, tab, i0, i1, w };
}

// fbm: октавы cell, cell/2, … с весами 1, ½, …, σ ≈ 1; row(py, out) пишет строку пикселей
function noiseRows(S, N, cell, oct, seed) {
  const os = [], amps = [];
  let norm = 0;
  for (let o = 0; o < oct; o++) { os.push(octave(S, N, cell / 2 ** o, seed + o * 101)); norm += 0.25 ** o; }
  for (let o = 0; o < oct; o++) amps.push(0.5 ** o / Math.sqrt(norm));
  const out = new Float32Array(N);
  return function row(py) {
    out.fill(0);
    for (let o = 0; o < oct; o++) {
      const { P, tab, i0, i1, w } = os[o], amp = amps[o];
      const r0 = i0[py] * P, r1 = i1[py] * P, wy = w[py];
      for (let px = 0; px < N; px++) {
        const a0 = i0[px], a1 = i1[px], wx = w[px];
        const top = tab[r0 + a0] + (tab[r0 + a1] - tab[r0 + a0]) * wx;
        const bot = tab[r1 + a0] + (tab[r1 + a1] - tab[r1 + a0]) * wx;
        out[px] += (top + (bot - top) * wy) * amp;
      }
    }
    return out;
  };
}

// ───────── раскладки ─────────
// Каждая раскладка отдаёт выпуклые многоугольники-ячейки (шаг = элемент + шов) в мм,
// покрывающие S×S с заворотом. Шов вырезается позже по расстоянию до края ячейки.

function fit(S, pitch, override, mult) {
  mult = mult || 1;
  if (override > 0) return Math.max(1, Math.round(override));
  return Math.max(mult, Math.round(S / pitch / mult) * mult);
}

function rect(x0, y0, x1, y1) { return [x0, y0, x1, y0, x1, y1, x0, y1]; }

export function parseOffset(s) {
  s = String(s || "").trim();
  if (s === "rand") return { rand: true, p: 0, q: 1 };
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (!m) return { p: 0, q: 1 };
  const q = Math.max(1, +m[2]), p = mod(+m[1], q), g = gcd(p, q);
  return p === 0 ? { p: 0, q: 1 } : { p: p / g, q: q / g };
}

function pct(actual, nominal) {
  const v = (actual / nominal - 1) * 100;
  return (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(1) + " %";
}

function layoutRows(P, S, ruleCycle, R) {
  const j = P.joint;
  const off = P.layout === "running" ? parseOffset(P.offset) : { p: 0, q: 1 };
  const rowMult = lcm(off.rand ? 1 : off.q, ruleCycle);
  const nx = fit(S, P.ex + j, P.countX);
  const ny = fit(S, P.ey + j, P.countY, rowMult);
  const px = S / nx, py = S / ny;
  const J = clamp(P.jitter / 100, 0, 0.3);
  const cells = [];
  let prev = 0;
  for (let r = 0; r < ny; r++) {
    let o = 0;
    if (off.rand) {
      // случайная фаза ряда, швы не ближе 0.2 шага к швам предыдущего ряда
      for (let t = 0; t < 30; t++) {
        o = R() * px;
        if (r === 0 || Math.abs(mod((o - prev) / px, 1) - 0.5) <= 0.3) break;
      }
      prev = o;
    } else {
      o = (mod(r * off.p, off.q) / off.q) * px;
    }
    const xs = [];
    for (let i = 0; i < nx; i++) xs.push(i * px - o + (J > 0 ? (R() * 2 - 1) * J * px : 0));
    xs.sort((a, b) => a - b);
    xs.push(xs[0] + S);
    for (let i = 0; i < nx; i++) cells.push({ poly: rect(xs[i], r * py, xs[i + 1], (r + 1) * py), row: r, col: i });
  }
  return {
    cells, kind: "grid", rows: ny, cols: nx, rowMult,
    countText: `${nx} × ${ny} шт`,
    elemText: `элемент ${(px - j).toFixed(1)} × ${(py - j).toFixed(1)} мм (номинал ${P.ex} × ${P.ey}: ${pct(px, P.ex + j)} / ${pct(py, P.ey + j)})`,
    dev: Math.max(Math.abs(px / (P.ex + j) - 1), Math.abs(py / (P.ey + j) - 1)),
    random: off.rand || J > 0,
  };
}

function brickRatio(P) {
  const L = Math.max(P.ex, P.ey), W = Math.min(P.ex, P.ey), j = P.joint;
  return { L, W, k: Math.max(1, Math.round((L + j) / (W + j))) };
}

// Ёлочка: пара «вертикальный + горизонтальный» элемент, решётка (W, W) и (L, −L), L = k·W.
// multi > 1 — двойная / тройная ёлочка: каждый элемент пары = multi планок рядом.
function herringBase(P) {
  const j = P.joint, L = Math.max(P.ex, P.ey), W = Math.min(P.ex, P.ey);
  const m = clamp(Math.round(num(P.multi, 1)), 1, 4);
  const k = Math.max(2, Math.round((L + j) / (m * (W + j))));
  return { j, L, W, m, k };
}

// прямоугольник, разрезанный на m полос (splitX — полосы по X, иначе по Y)
function strips(x0, y0, x1, y1, m, splitX) {
  const out = [];
  for (let i = 0; i < m; i++) {
    out.push(splitX ? rect(x0 + ((x1 - x0) * i) / m, y0, x0 + ((x1 - x0) * (i + 1)) / m, y1)
      : rect(x0, y0 + ((y1 - y0) * i) / m, x1, y0 + ((y1 - y0) * (i + 1)) / m));
  }
  return out;
}

function herringTexts(cells, k, m, Lc, Wc, b, extra) {
  const { j, L, W } = b;
  return {
    countText: `${extra}, ${cells.length} шт (L = ${k}·${m > 1 ? m + "·" : ""}W${m > 1 ? `, по ${m} планки` : ""})`,
    elemText: `элемент ${(Lc - j).toFixed(1)} × ${(Wc / m - j).toFixed(1)} мм (номинал ${L} × ${W}: ${pct(Lc, L + j)} / ${pct(Wc / m, W + j)})`,
    dev: Math.max(Math.abs(Lc / (L + j) - 1), Math.abs(Wc / m / (W + j) - 1)),
  };
}

function layoutHerring90(P, S) {
  const b = herringBase(P), { k, m } = b;
  const n = fit(S, 2 * k * m * (b.W + b.j), P.countX);
  const M = 2 * n * k, Wc = S / M, Lc = k * Wc;
  const cells = [], seen = new Set();
  for (let bb = 0; bb < n; bb++) for (let a = 0; a < M; a++) {
    const tu = mod(a + bb * k, M), tv = mod(a - bb * k, M), key = tu * M + tv;
    if (seen.has(key)) throw new Error("ёлочка: повтор пары " + key);
    seen.add(key);
    const tx = tu * Wc, ty = tv * Wc;
    strips(tx, ty, tx + Wc, ty + Lc, m, true).forEach((poly, i) => cells.push({ poly, row: bb, col: 2 * a * m + i, part: 0 }));
    strips(tx + Wc, ty, tx + Wc + Lc, ty + Wc, m, false).forEach((poly, i) => cells.push({ poly, row: bb, col: (2 * a + 1) * m + i, part: 1 }));
  }
  return Object.assign({ cells, kind: "herring", rows: n, cols: 2 * M * m, rowMult: 1 },
    herringTexts(cells, k, m, Lc, Wc, b, `${n} × ${n} модулей ${(2 * Lc).toFixed(0)} мм`));
}

// Та же ёлочка, повёрнутая на −45°: решётка становится прямоугольной W√2 × L√2
function layoutHerring45(P, S) {
  const b = herringBase(P), { k, m } = b;
  const ny = fit(S, k * m * (b.W + b.j) * SQ2, P.countY), nx = k * ny;
  const Wc = S / (nx * SQ2), Lc = k * Wc;
  const rot = (pts) => { const o = []; for (let i = 0; i < pts.length; i += 2) o.push((pts[i] + pts[i + 1]) / SQ2, (pts[i + 1] - pts[i]) / SQ2); return o; };
  const V = strips(0, 0, Wc, Lc, m, true).map(rot), H = strips(Wc, 0, Wc + Lc, Wc, m, false).map(rot);
  const cells = [];
  for (let bb = 0; bb < ny; bb++) for (let a = 0; a < nx; a++) {
    const tx = a * Wc * SQ2, ty = bb * Lc * SQ2;
    V.forEach((p, i) => cells.push({ poly: p.map((v, q) => v + (q & 1 ? ty : tx)), row: bb, col: 2 * a * m + i, part: 0 }));
    H.forEach((p, i) => cells.push({ poly: p.map((v, q) => v + (q & 1 ? ty : tx)), row: bb, col: (2 * a + 1) * m + i, part: 1 }));
  }
  return Object.assign({ cells, kind: "herring", rows: ny, cols: 2 * nx * m, rowMult: 1 },
    herringTexts(cells, k, m, Lc, Wc, b, `${nx} × ${ny} модулей`));
}

// ───────── общий механизм: мотив одного периода Px × Py → вся текстура ─────────
// Ячейка мотива: poly (выпуклый многоугольник) и/или terms (круги для чешуи), part — часть узора.
function replicate(motif, Px, Py, nX, nY, S) {
  const sx = S / (nX * Px), sy = S / (nY * Py), cells = [];
  let rowsPer = 1, colsPer = 1;
  for (const m of motif) { rowsPer = Math.max(rowsPer, (m.row || 0) + 1); colsPer = Math.max(colsPer, (m.col || 0) + 1); }
  for (let iy = 0; iy < nY; iy++) for (let ix = 0; ix < nX; ix++) {
    const ox = ix * Px, oy = iy * Py;
    for (const m of motif) {
      const c = { row: iy * rowsPer + (m.row || 0), col: ix * colsPer + (m.col || 0), part: m.part || 0 };
      c.poly = m.poly.map((v, i) => (i & 1 ? (v + oy) * sy : (v + ox) * sx));
      if (m.terms) c.terms = m.terms.map((t) => ({ k: t.k, x: (t.x + ox) * sx, y: (t.y + oy) * sy, r: t.r * Math.sqrt(sx * sy) }));
      cells.push(c);
    }
  }
  return { cells, sx, sy, rows: nY * rowsPer, cols: nX * colsPer };
}

// все сдвиги базовых фигур по решётке u, v внутри тора Px × Py (обход в ширину)
function latticeMotif(base, u, v, Px, Py) {
  const wrap = (x, P) => { let m = mod(x, P); if (P - m < 1e-6) m = 0; return m; };
  const key = (x, y) => Math.round(wrap(x, Px) * 1000) + ":" + Math.round(wrap(y, Py) * 1000);
  const out = [], seen = new Set([key(0, 0)]), queue = [[0, 0]];
  while (queue.length) {
    const [i, j] = queue.shift();
    const tx = i * u[0] + j * v[0], ty = i * u[1] + j * v[1];
    const dx = wrap(tx, Px) - tx, dy = wrap(ty, Py) - ty;
    for (const b of base) out.push(Object.assign({}, b, { poly: b.poly.map((val, q) => val + (q & 1 ? ty + dy : tx + dx)), i, j, col: out.length }));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, kk = key(ni * u[0] + nj * v[0], ni * u[1] + nj * v[1]);
      if (!seen.has(kk)) { seen.add(kk); queue.push([ni, nj]); }
    }
    if (out.length > 50000) throw new Error("решётка не замыкается на период");
  }
  return out;
}

function isoTexts(r, n, unit) {
  return { countText: `${n} × ${n} модулей ${unit.toFixed(0)} мм, ${r.cells.length} шт` };
}

// Диагональ 45°: прямоугольник L = k·W (квадрат при k = 1), период √2·L по обеим осям
function layoutDiagonal(P, S) {
  const j = P.joint, L = Math.max(P.ex, P.ey), W = Math.min(P.ex, P.ey);
  const k = Math.max(1, Math.round((L + j) / (W + j)));
  const Wp = W + j, Lp = k * Wp, Pn = SQ2 * Lp, c = Math.SQRT1_2;
  const R = (x, y) => [(x - y) * c, (x + y) * c];
  const poly = [[-Lp / 2, -Wp / 2], [Lp / 2, -Wp / 2], [Lp / 2, Wp / 2], [-Lp / 2, Wp / 2]].flatMap(([x, y]) => R(x, y));
  // шахматка (часть = чётность i + j) согласована с периодом только при нечётном k
  const motif = latticeMotif([{ poly }], R(Lp, 0), R(0, Wp), Pn, Pn).map((m) => ({ poly: m.poly, col: m.col, part: k % 2 ? mod(m.i + m.j, 2) : 0 }));
  const n = fit(S, Pn, P.countX), r = replicate(motif, Pn, Pn, n, n, S), s = r.sx;
  return Object.assign({ cells: r.cells, kind: "lattice", rows: r.rows, cols: r.cols, rowMult: 1 }, isoTexts(r, n, Pn * s), {
    elemText: `элемент ${(Lp * s - j).toFixed(1)} × ${(Wp * s - j).toFixed(1)} мм (номинал ${L} × ${W}: ${pct(Lp * s, L + j)} / ${pct(Wp * s, W + j)})`,
    dev: Math.max(Math.abs((Lp * s) / (L + j) - 1), Math.abs((Wp * s) / (W + j) - 1)),
  });
}

// Французская ёлочка: полосы шириной C, в них параллелограммы с наклоном ±angle, торцы — по границе полос
function layoutChevron(P, S) {
  const j = P.joint, L = Math.max(P.ex, P.ey), W = Math.min(P.ex, P.ey);
  const deg = clamp(num(P.angle, 45), 15, 75), al = (deg * Math.PI) / 180, t = Math.tan(al);
  const C = (L + j) * Math.cos(al), h = (W + j) / Math.cos(al);
  const nX = fit(S, 2 * C, P.countX), nY = fit(S, h, P.countY);
  const motif = [
    { poly: [0, 0, C, C * t, C, C * t + h, 0, h], col: 0, part: 0 },
    { poly: [C, C * t, 2 * C, 0, 2 * C, h, C, C * t + h], col: 1, part: 1 },
  ];
  const r = replicate(motif, 2 * C, h, nX, nY, S);
  return {
    cells: r.cells, kind: "chevron", rows: r.rows, cols: r.cols, rowMult: 1,
    countText: `${nX} × ${nY} модулей, ${r.cells.length} шт, угол ${deg}°`,
    elemText: `планка ~${((L + j) * Math.hypot(r.sx * Math.cos(al), r.sy * Math.sin(al)) - j).toFixed(1)} × ${((W + j) * r.sy - j).toFixed(1)} мм (подгонка X ${pct(r.sx, 1)}, Y ${pct(r.sy, 1)})`,
    dev: Math.max(Math.abs(r.sx - 1), Math.abs(r.sy - 1)),
  };
}

// Ветряная мельница: 4 прямоугольника a×b вокруг квадрата (a − b), блок (a + b)²
function layoutWindmill(P, S) {
  const j = P.joint, a = Math.max(P.ex, P.ey) + j, b = Math.min(P.ex, P.ey) + j, Q = a + b;
  const n = fit(S, Q, P.countX);
  const motif = [
    { poly: rect(0, 0, a, b), col: 0 }, { poly: rect(a, 0, Q, a), col: 1 },
    { poly: rect(b, a, Q, Q), col: 2 }, { poly: rect(0, b, b, Q), col: 3 },
    { poly: rect(b, b, a, a), col: 4, part: 1 },
  ];
  const r = replicate(motif, Q, Q, n, n, S), s = r.sx;
  return Object.assign({ cells: r.cells, kind: "lattice", rows: r.rows, cols: r.cols, rowMult: 1 }, isoTexts(r, n, Q * s), {
    elemText: `прямоугольник ${(a * s - j).toFixed(1)} × ${(b * s - j).toFixed(1)}, квадрат ${((a - b) * s - j).toFixed(1)} мм (${pct(s, 1)})`,
    dev: Math.abs(s - 1),
  });
}

// Вертушка (пифагорова раскладка): большой квадрат A и малый B = A / r, решётка (A, B), (−B, A)
function layoutHopscotch(P, S) {
  const j = P.joint, A = Math.max(P.ex, P.ey) + j, r0 = Math.max(2, Math.round(A / (Math.min(P.ex, P.ey) + j))), B = A / r0;
  const Pn = (r0 * r0 + 1) * B;
  const motif = latticeMotif([{ poly: rect(0, 0, A, A), part: 0 }, { poly: rect(A, 0, A + B, B), part: 1 }], [A, B], [-B, A], Pn, Pn);
  const n = fit(S, Pn, P.countX), r = replicate(motif, Pn, Pn, n, n, S), s = r.sx;
  return Object.assign({ cells: r.cells, kind: "lattice", rows: r.rows, cols: r.cols, rowMult: 1 }, isoTexts(r, n, Pn * s), {
    elemText: `квадраты ${(A * s - j).toFixed(1)} и ${(B * s - j).toFixed(1)} мм (A = ${r0}·B, ${pct(s, 1)})`,
    dev: Math.max(Math.abs(s - 1), Math.abs((B * s) / (Math.min(P.ex, P.ey) + j) - 1)),
  });
}

// Рыбья чешуя: круги радиуса R, ряды через R со сдвигом R; чешуя = круг минус два круга ряда выше
function layoutScales(P, S) {
  const j = P.joint, D = P.ex + j, R0 = D / 2;
  const n = fit(S, D, P.countX);
  const disk = (x, y) => ({ k: 1, x, y, r: R0 }), out = (x, y) => ({ k: 2, x, y, r: R0 });
  const motif = [
    { poly: rect(-R0, -R0, R0, R0), terms: [disk(0, 0), out(-R0, -R0), out(R0, -R0)], row: 0 },
    { poly: rect(0, 0, D, D), terms: [disk(R0, R0), out(0, 0), out(D, 0)], row: 1 },
  ];
  const r = replicate(motif, D, D, n, n, S), s = r.sx;
  return {
    cells: r.cells, kind: "grid", rows: r.rows, cols: r.cols, rowMult: 2,
    countText: `${n} × ${2 * n} шт`,
    elemText: `чешуя ${(D * s - j).toFixed(1)} мм (номинал ${P.ex}: ${pct(D * s, D)})`,
    dev: Math.abs(s - 1),
  };
}

// Модульная: решётка модулей n×n, жадное заполнение тора форматами из списка (seed)
export function parseSizes(text) {
  const out = [];
  for (const t of String(text || "").split(/[\s,;]+/).filter(Boolean)) {
    const m = /^(\d+)\s*[xх×*]\s*(\d+)(?::(\d+(?:\.\d+)?))?$/i.exec(t);
    if (!m) throw new Error(`формат «${t}» не понят (нужно 2x1 или 2x1:3)`);
    out.push({ w: +m[1], h: +m[2], wt: m[3] ? +m[3] : 1 });
  }
  if (!out.length) throw new Error("список форматов пуст");
  return out;
}

function layoutModular(P, S, R) {
  const j = P.joint, sizes = parseSizes(P.modSizes);
  const n = Math.max(2, fit(S, P.ex + j, P.countX)), u = S / n;
  const occ = new Uint8Array(n * n), cells = [];
  const free = (x, y, w, h) => {
    if (w > n || h > n) return false;
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (occ[mod(y + dy, n) * n + mod(x + dx, n)]) return false;
    return true;
  };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (occ[y * n + x]) continue;
    // случайный порядок с весами (ключ −ln(u)/w), берём первый влезающий формат
    const pool = sizes.map((s, i) => ({ s, i, key: -Math.log(R() + 1e-12) / Math.max(s.wt, 1e-6) })).sort((a, b) => a.key - b.key);
    let pick = pool.find((p) => free(x, y, p.s.w, p.s.h));
    if (!pick) pick = { s: { w: 1, h: 1 }, i: sizes.length };
    for (let dy = 0; dy < pick.s.h; dy++) for (let dx = 0; dx < pick.s.w; dx++) occ[mod(y + dy, n) * n + mod(x + dx, n)] = 1;
    cells.push({ poly: rect(x * u, y * u, (x + pick.s.w) * u, (y + pick.s.h) * u), row: y, col: x, part: pick.i });
  }
  return {
    cells, kind: "modular", rows: n, cols: n, rowMult: 1, random: true,
    countText: `${n} × ${n} модулей, ${cells.length} шт`,
    elemText: `модуль ${(u - j).toFixed(1)} мм (номинал ${P.ex}: ${pct(u, P.ex + j)}), форматы ${sizes.map((s) => s.w + "×" + s.h).join(", ")}`,
    dev: Math.abs(u / (P.ex + j) - 1),
  };
}

// ───────── кирпичная кладка ─────────
// Строка = ряд сверху вниз, строки идут циклом. Ширина — в четвертях кирпича q = (L + шов) / 4:
//   L — ложок (4q), T — тычок (2q), R — ложок на ребро (4q, ряд высотой W), S — солдатик (ряд высотой L),
//   _N — пустота N четвертей (ажурная), ? — случайные ложки/тычки, @x — начальный сдвиг (q), >s — сдвиг за цикл.
const BOND_W = { L: 4, T: 2, R: 4 };
export function parseBond(text) {
  const lines = [];
  const src = String(text || "").split(/\r?\n/);
  for (let ln = 0; ln < src.length; ln++) {
    const s = src[ln].replace(/#.*/, "").trim();
    if (!s) continue;
    const L = { src: s, items: [], off: 0, shift: 0, random: false, kind: null };
    const bad = (msg) => { throw new Error(`кладка, строка ${ln + 1} «${s}»: ${msg}`); };
    for (let t of s.split(/[\s,;]+/).filter(Boolean)) {
      t = t.toUpperCase().replace(/Л/g, "L").replace(/Т/g, "T").replace(/С/g, "S").replace(/Р/g, "R");
      let m;
      if ((m = /^@([+-]?\d+(?:\.\d+)?)$/.exec(t))) L.off = +m[1];
      else if ((m = /^>([+-]?\d+)$/.exec(t))) L.shift = +m[1];
      else if (t === "?") L.random = true;
      else if ((m = /^_(\d*)$/.exec(t))) L.items.push({ t: "_", w: m[1] ? +m[1] : 2 });
      else if (/^[LTRS]+$/.test(t)) for (const ch of t) L.items.push({ t: ch, w: BOND_W[ch] || 0 });
      else bad(`непонятный элемент «${t}»`);
    }
    const kinds = new Set(L.items.filter((i) => i.t !== "_").map((i) => (i.t === "R" ? "W" : i.t === "S" ? "S" : "H")));
    if (L.random) { if (L.items.length) bad("«?» — только один в ряду"); kinds.add("H"); }
    if (kinds.size > 1) bad("в одном ряду элементы разной высоты (L/T, R, S)");
    if (!kinds.size) bad("нет элементов");
    L.kind = [...kinds][0];
    if (L.kind === "S" && L.items.some((i) => i.t === "_")) bad("пустоты в ряду солдатиков не поддерживаются");
    L.period = L.random ? 2 : L.kind === "S" ? 1 : L.items.reduce((a, i) => a + i.w, 0);
    lines.push(L);
  }
  if (!lines.length) throw new Error("кладка: схема пустая");
  return lines;
}

function layoutBond(P, S, ruleCycle, R) {
  const j = P.joint, Lb = P.ex, Wb = P.ey, Hb = Math.max(5, num(P.ez, 65));
  const lines = parseBond(P.bond), q0 = (Lb + j) / 4;
  let per = 2;
  for (const L of lines) if (L.kind !== "S") per = lcm(per, Math.max(1, Math.round(L.period)));
  const nq = P.countX > 0 ? Math.max(per, Math.round((P.countX * 4) / per) * per) : Math.max(per, Math.round(S / q0 / per) * per);
  const q = S / nq;
  const rowH = (k) => (k === "H" ? Hb : k === "W" ? Wb : Lb) + j;
  const Hc = lines.reduce((a, L) => a + rowH(L.kind), 0);
  let cyc = 1;
  for (const L of lines) if (L.shift && L.kind !== "S" && !L.random) cyc = lcm(cyc, L.period / gcd(L.period, Math.abs(L.shift)));
  if (ruleCycle > 1) cyc = lcm(cyc, ruleCycle / gcd(ruleCycle, lines.length));
  const nCyc = P.countY > 0 ? Math.max(1, Math.round(P.countY / lines.length)) : Math.max(cyc, Math.round(S / Hc / cyc) * cyc);
  const sy = S / (nCyc * Hc);
  const nS = Math.max(1, Math.round(S / (Hb + j)));
  const PART = { L: 0, T: 1, S: 2, R: 3, _: 0 };
  const cells = [];
  let y = 0, row = 0, prevJoints = null;
  for (let c = 0; c < nCyc; c++) for (const L of lines) {
    const h = rowH(L.kind) * sy;
    let col = 0;
    const push = (x0, x1, t) => { cells.push({ poly: rect(x0, y, x1, y + h), row, col: col++, part: PART[t], void: t === "_" }); };
    if (L.kind === "S") {
      for (let i = 0; i < nS; i++) push((i * S) / nS, ((i + 1) * S) / nS, "S");
    } else if (L.random) {
      // дикая перевязка: случайные ложки/тычки, но шов не ложится на шов ряда ниже
      const prev = prevJoints || new Set();
      let p = Math.floor(R() * 4);
      for (let t = 0; t < 8 && prev.has(mod(p, nq)); t++) p = Math.floor(R() * 4);
      const joints = new Set([mod(p, nq)]);
      let sum = 0;
      while (sum < nq) {
        let w = R() < 0.5 ? 4 : 2;
        if (prev.has(mod(p + sum + w, nq)) && sum + 6 - w <= nq) w = 6 - w;
        if (sum + w > nq) w = nq - sum;
        push((p + sum) * q, (p + sum + w) * q, w === 4 ? "L" : "T");
        sum += w;
        joints.add(mod(p + sum, nq));
      }
      prevJoints = joints;
    } else {
      const x0 = L.off + L.shift * c;
      let sum = 0, i = 0;
      while (sum < nq - 1e-9) {
        const it = L.items[i++ % L.items.length];
        push((x0 + sum) * q, (x0 + sum + it.w) * q, it.t);
        sum += it.w;
      }
    }
    y += h;
    row++;
  }
  const hasT = lines.some((L) => L.random || L.items.some((i) => i.t === "T"));
  return {
    cells, kind: "bond", rows: row, cols: 0, rowMult: lines.length, random: lines.some((L) => L.random),
    countText: `${nq / 4} ложков по ширине × ${row} рядов (${nCyc} × цикл ${lines.length})`,
    elemText: `ложок ${(4 * q - j).toFixed(1)}` + (hasT ? `, тычок ${(2 * q - j).toFixed(1)}` : "") +
      ` × ${((Hb + j) * sy - j).toFixed(1)} мм (номинал ${Lb}×${Wb}×${Hb}: ${pct(q, q0)} / ${pct(sy, 1)})` +
      (hasT && Math.abs((Wb + j) / (2 * q0) - 1) > 0.02 ? " · тычок подогнан к ½ ложка" : ""),
    dev: Math.max(Math.abs(q / q0 - 1), Math.abs(sy - 1)),
  };
}

function layoutBasket(P, S) {
  const j = P.joint, { L, W, k } = brickRatio(P);
  const n = fit(S, 2 * k * (W + j), P.countX);
  const B = 2 * n, Wp = S / (B * k), Lp = k * Wp;
  const cells = [];
  for (let bj = 0; bj < B; bj++) for (let bi = 0; bi < B; bi++) for (let m = 0; m < k; m++) {
    if ((bi + bj) % 2 === 0) cells.push({ poly: rect(bi * Lp, bj * Lp + m * Wp, (bi + 1) * Lp, bj * Lp + (m + 1) * Wp), row: bj * k + m, col: bi, part: 0 });
    else cells.push({ poly: rect(bi * Lp + m * Wp, bj * Lp, bi * Lp + (m + 1) * Wp, (bj + 1) * Lp), row: bj * k, col: bi * k + m, part: 1 });
  }
  return {
    cells, kind: "basket", rows: B * k, cols: B * k, rowMult: 1,
    countText: `${B} × ${B} блоков по ${k} шт, ${cells.length} шт`,
    elemText: `элемент ${(Lp - j).toFixed(1)} × ${(Wp - j).toFixed(1)} мм (номинал ${L} × ${W}: ${pct(Lp, L + j)} / ${pct(Wp, W + j)})`,
    dev: Math.max(Math.abs(Lp / (L + j) - 1), Math.abs(Wp / (W + j) - 1)),
  };
}

// Шестигранник «вершиной вверх»: X — размер под ключ; период X = F, Y = √3·F (2 ряда).
// split — ромбы 3D: каждый шестигранник делится на 3 ромба (верх / право / лево = части 0 / 1 / 2)
function layoutHex(P, S, ruleCycle, split) {
  const j = P.joint, F = P.ex + j, R0 = F / SQ3;
  const nx = fit(S, F, P.countX);
  const pairMult = ruleCycle % 2 === 0 ? ruleCycle / 2 : ruleCycle;
  const nr2 = fit(S, SQ3 * F, P.countY ? Math.ceil(P.countY / 2) : 0, pairMult);
  const sx = S / (nx * F), sy = S / (nr2 * SQ3 * F);
  const cells = [];
  for (let r = 0; r < 2 * nr2; r++) for (let c = 0; c < nx; c++) {
    const cx = c * F + (r & 1) * F / 2, cy = r * 1.5 * R0, V = [];
    for (let v = 0; v < 6; v++) {
      const t = (Math.PI / 3) * v - Math.PI / 2;
      V.push([(cx + R0 * Math.cos(t)) * sx, (cy + R0 * Math.sin(t)) * sy]);
    }
    if (!split) { cells.push({ poly: V.flat(), row: r, col: c }); continue; }
    const C0 = [cx * sx, cy * sy]; // V: 0 верх, 1 вверху справа, 2 внизу справа, 3 низ, 4 внизу слева, 5 вверху слева
    cells.push({ poly: [V[5], V[0], V[1], C0].flat(), row: r, col: 3 * c, part: 0 });
    cells.push({ poly: [C0, V[1], V[2], V[3]].flat(), row: r, col: 3 * c + 1, part: 1 });
    cells.push({ poly: [V[5], C0, V[3], V[4]].flat(), row: r, col: 3 * c + 2, part: 2 });
  }
  return {
    cells, kind: split ? "lattice" : "grid", rows: 2 * nr2, cols: split ? 3 * nx : nx, rowMult: 2,
    countText: split ? `${nx} × ${2 * nr2} кубов, ${cells.length} ромбов` : `${nx} × ${2 * nr2} шт`,
    elemText: (split ? `ромб, сторона ${(R0 * sx - j * 0.58).toFixed(1)} мм; ` : "") + `под ключ ${(F * sx - j).toFixed(1)} мм (номинал ${P.ex}: ${pct(F * sx, F)}), сжатие по Y ${pct(sy, sx)}`,
    dev: Math.max(Math.abs(sx - 1), Math.abs(sy - 1)),
  };
}

// Плитняк: периодичная диаграмма Вороного по решётке n×n с разбросом и релаксацией Ллойда
function clipHalf(poly, ax, ay, c) { // оставить a·p ≤ c
  const out = [], n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = poly[2 * i], y1 = poly[2 * i + 1], i2 = (i + 1) % n, x2 = poly[2 * i2], y2 = poly[2 * i2 + 1];
    const d1 = ax * x1 + ay * y1 - c, d2 = ax * x2 + ay * y2 - c;
    if (d1 <= 0) out.push(x1, y1);
    if ((d1 <= 0) !== (d2 <= 0)) { const t = d1 / (d1 - d2); out.push(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t); }
  }
  return out;
}

function polyCentroid(p) {
  let a = 0, cx = 0, cy = 0;
  const n = p.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = p[2 * i], y1 = p[2 * i + 1], i2 = (i + 1) % n, x2 = p[2 * i2], y2 = p[2 * i2 + 1];
    const cr = x1 * y2 - x2 * y1;
    a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
  }
  if (Math.abs(a) < 1e-12) return [p[0], p[1]];
  return [cx / (3 * a), cy / (3 * a)];
}

function layoutVoronoi(P, S, R) {
  const j = P.joint;
  const n = Math.max(2, fit(S, P.ex + j, P.countX));
  const c = S / n, J = clamp(P.jitter / 100, 0, 1);
  const sx = new Float64Array(n * n), sy = new Float64Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    sx[y * n + x] = (x + 0.5 + J * (R() - 0.5)) * c;
    sy[y * n + x] = (y + 0.5 + J * (R() - 0.5)) * c;
  }
  const build = () => {
    const polys = [];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = y * n + x, px = sx[i], py = sy[i];
      let poly = rect(px - 2.5 * c, py - 2.5 * c, px + 2.5 * c, py + 2.5 * c);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const xx = x + dx, yy = y + dy, wx = Math.floor(xx / n), wy = Math.floor(yy / n);
        const q = (yy - wy * n) * n + (xx - wx * n);
        const qx = sx[q] + wx * S, qy = sy[q] + wy * S;
        poly = clipHalf(poly, qx - px, qy - py, (qx * qx + qy * qy - px * px - py * py) / 2);
      }
      polys.push(poly);
    }
    return polys;
  };
  let polys = build();
  for (let it = 0; it < clamp(Math.round(P.relax), 0, 4); it++) {
    // без заворота по S: соседи берутся по индексу решётки, иначе сайт у края теряет соседей
    for (let i = 0; i < n * n; i++) { const [cx, cy] = polyCentroid(polys[i]); sx[i] = cx; sy[i] = cy; }
    polys = build();
  }
  const cells = polys.map((poly, i) => ({ poly, row: Math.floor(i / n), col: i % n }));
  return {
    cells, kind: "voronoi", rows: n, cols: n, rowMult: 1, random: true,
    countText: `${n} × ${n} = ${cells.length} камней`,
    elemText: `средний камень ~${(c - j).toFixed(0)} мм (номинал ${P.ex}: ${pct(c, P.ex + j)})`,
    dev: Math.abs(c / (P.ex + j) - 1),
  };
}

export function buildLayout(P, ruleCycle, R) {
  const S = P.size;
  let lay;
  switch (P.layout) {
    case "herring90": lay = layoutHerring90(P, S); break;
    case "herring45": lay = layoutHerring45(P, S); break;
    case "basket": lay = layoutBasket(P, S); break;
    case "hex": lay = layoutHex(P, S, ruleCycle, false); break;
    case "rhombus": lay = layoutHex(P, S, ruleCycle, true); break;
    case "voronoi": lay = layoutVoronoi(P, S, R); break;
    case "diagonal": lay = layoutDiagonal(P, S); break;
    case "chevron": lay = layoutChevron(P, S); break;
    case "windmill": lay = layoutWindmill(P, S); break;
    case "hopscotch": lay = layoutHopscotch(P, S); break;
    case "scales": lay = layoutScales(P, S); break;
    case "modular": lay = layoutModular(P, S, R); break;
    case "bond": lay = layoutBond(P, S, ruleCycle, R); break;
    default: lay = layoutRows(P, S, ruleCycle, R);
  }
  if (P.rotate) for (const c of lay.cells) {
    const p = c.poly;
    for (let i = 0; i < p.length; i += 2) { const t = p[i]; p[i] = p[i + 1]; p[i + 1] = t; }
    if (c.terms) for (const t of c.terms) { const x = t.x; t.x = t.y; t.y = x; }
  }
  return lay;
}

// ───────── правила вставок ─────────
// Строка = ряд сверху вниз, цикл строк повторяется по всей текстуре.
//   -            ряд целиком из материала 1
//   =N           ряд целиком из материала N
//   4 1          промежутки: 4 осн., вставка, 1 осн., вставка, … (период = сумма + число вставок)
//   :1121        явная последовательность материалов, повторяется по ряду
// Модификаторы: *N — материал вставки (по умолчанию 2), /N — основной (по умолчанию 1),
//   >S — сдвиг каждого следующего такого ряда на S элементов (−1 = влево), @O — начальный сдвиг.
export function parseRules(text, nMat) {
  const lines = [];
  const src = String(text || "").split(/\r?\n/);
  for (let ln = 0; ln < src.length; ln++) {
    const s = src[ln].replace(/#.*/, "").trim();
    if (!s) continue;
    const toks = s.split(/[\s,;]+/).filter(Boolean);
    const L = { src: s, type: "gaps", base: 0, ins: 1, shift: 0, start: 0, gaps: [], seq: null, mat: 0, period: 0 };
    const bad = (msg) => ({ ok: false, error: `строка ${ln + 1} «${s}»: ${msg}`, lines: [] });
    for (const t of toks) {
      let m;
      if (t === "-") { L.type = "solid"; L.mat = 0; }
      else if ((m = /^=(\d+)$/.exec(t))) { L.type = "solid"; L.mat = +m[1] - 1; }
      else if ((m = /^:([1-9]+)$/.exec(t))) { L.type = "seq"; L.seq = m[1].split("").map((d) => +d - 1); }
      else if ((m = /^\*(\d+)$/.exec(t))) L.ins = +m[1] - 1;
      else if ((m = /^\/(\d+)$/.exec(t))) L.base = +m[1] - 1;
      else if ((m = /^>([+-]?\d+)$/.exec(t))) L.shift = +m[1];
      else if ((m = /^@([+-]?\d+)$/.exec(t))) L.start = +m[1];
      else if (/^\d+$/.test(t)) L.gaps.push(+t);
      else return bad(`непонятный элемент «${t}»`);
    }
    if (L.type === "gaps") {
      if (!L.gaps.length) return bad("нет промежутков");
      L.set = new Set();
      let pos = 0;
      for (const g of L.gaps) { pos += g; L.set.add(pos); pos++; }
      L.period = pos;
    } else if (L.type === "seq") L.period = L.seq.length;
    const used = L.type === "solid" ? [L.mat] : L.type === "seq" ? L.seq : [L.base, L.ins];
    for (const u of used) if (u < 0 || u >= nMat) return bad(`материала ${u + 1} нет (всего ${nMat})`);
    lines.push(L);
  }
  if (!lines.length) return { ok: false, error: "правило пустое", lines: [] };
  return { ok: true, lines };
}

export function ruleMat(rules, row, col) {
  const Ls = rules.lines, n = Ls.length, L = Ls[mod(row, n)], k = Math.floor(row / n);
  if (L.type === "solid") return L.mat;
  const p = mod(col - L.start - L.shift * k, L.period);
  if (L.type === "seq") return L.seq[p];
  return L.set.has(p) ? L.ins : L.base;
}

// ───────── декор элементов (пэчворк / калейдоскоп) ─────────
export const DECORS = [
  ["none", "нет"], ["circle", "круг"], ["ring", "кольцо"], ["diamond", "ромб"], ["cross", "крест"], ["star", "звезда"],
  ["flower", "цветок"], ["frame", "рамка"], ["truchet", "дуги (трюше)"], ["diag", "диагональ"], ["quarter", "четверть круга"],
];
// знаковое расстояние до края фигуры в координатах элемента u, v ∈ [−1, 1] (> 0 — внутри)
function decorSD(code, u, v) {
  const au = Math.abs(u), av = Math.abs(v), rr = Math.hypot(u, v);
  switch (code) {
    case 1: return 0.6 - rr;
    case 2: return 0.1 - Math.abs(rr - 0.55);
    case 3: return (0.7 - au - av) * 0.7071;
    case 4: return Math.min(0.14 - Math.min(au, av), 0.8 - Math.max(au, av));
    case 5: return (0.8 - Math.sqrt(au) - Math.sqrt(av)) * 0.5;
    case 6: { const c = 0.34; return Math.max(c - Math.hypot(au - c, av), c - Math.hypot(au, av - c)); }
    case 7: return 0.07 - Math.abs(Math.max(au, av) - 0.72);
    case 8: return 0.13 - Math.min(Math.abs(Math.hypot(u + 1, v + 1) - 1), Math.abs(Math.hypot(u - 1, v - 1) - 1));
    case 9: return 0.16 - Math.abs(u - v) * 0.7071;
    case 10: return 1.0 - Math.hypot(u + 1, v + 1);
  }
  return -1;
}

// ───────── выборка текстур (размеры — степени двойки, заворот по маске) ─────────
function bil1(m, u, v, c) {
  const w = m.w, hh = m.h, d = m.data;
  u -= 0.5; v -= 0.5;
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const xa = x0 & (w - 1), xb = (x0 + 1) & (w - 1), ya = (y0 & (hh - 1)) * w, yb = ((y0 + 1) & (hh - 1)) * w;
  const o = c || 0, a = d[(ya + xa) * 4 + o], b = d[(ya + xb) * 4 + o], e = d[(yb + xa) * 4 + o], f = d[(yb + xb) * 4 + o];
  return a + (b - a) * fx + (e - a) * fy + (a - b - e + f) * fx * fy;
}
function bil3(m, u, v, out) {
  const w = m.w, hh = m.h, d = m.data;
  u -= 0.5; v -= 0.5;
  const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
  const xa = x0 & (w - 1), xb = (x0 + 1) & (w - 1), ya = (y0 & (hh - 1)) * w, yb = ((y0 + 1) & (hh - 1)) * w;
  const ia = (ya + xa) * 4, ib = (ya + xb) * 4, ie = (yb + xa) * 4, iF = (yb + xb) * 4;
  const w0 = (1 - fx) * (1 - fy), w1 = fx * (1 - fy), w2 = (1 - fx) * fy, w3 = fx * fy;
  for (let c = 0; c < 3; c++) out[c] = d[ia + c] * w0 + d[ib + c] * w1 + d[ie + c] * w2 + d[iF + c] * w3;
}
const rgbCache = new Map();
function hexToRgbCached(h) {
  let v = rgbCache.get(h);
  if (!v) { v = hexToRgb(h).map((x) => x * 255); rgbCache.set(h, v); }
  return v;
}

// ───────── растр: владелец пикселя и расстояние до края ячейки ─────────
function rasterize(cells, N, S, P, R, zig) {
  const k = N / S;
  const best = new Float32Array(N * N).fill(-1e30);
  const id = new Int32Array(N * N);
  const eny = new Int8Array(N * N); // y-составляющая внутренней нормали ближайшей кромки × 127 (для несимметричных профилей шва)
  const irr = Math.max(0, num(P.irregular, 0));
  const rc = Math.max(0, num(P.corner, 0)) * 1.17; // smin-ширина ≈ радиус скругления
  const zA = zig ? zig.amp : 0, zP = zig ? zig.period : 1;
  const tri = (t) => { const f = t - 0.25 - Math.floor(t - 0.25); return 2 * Math.abs(2 * f - 1) - 1; }; // нечётная «пила»: зигзаг стыка
  const A = new Float64Array(64), B = new Float64Array(64), C = new Float64Array(64), rowC = new Float64Array(64), rowS = new Float64Array(64);
  const nc = cells.length;
  const cx = new Float32Array(nc), cy = new Float32Array(nc), cw = new Float32Array(nc), chh = new Float32Array(nc), cang = new Float32Array(nc);
  // ячейка из кругов (чешуя): d = min(R − |p − c| для «внутри», |p − c| − R для «снаружи»)
  function rasterTerms(T, ci, minx, maxx, miny, maxy) {
    const nt = T.length, TK = new Int8Array(nt), TX = new Float64Array(nt), TY = new Float64Array(nt), TR = new Float64Array(nt);
    T.forEach((t, i) => { TK[i] = t.k; TX[i] = t.x; TY[i] = t.y; TR[i] = t.r - (irr > 0 && t.k === 1 ? R() * Math.min(irr, 0.08 * t.r) : 0); });
    const x0 = Math.floor(minx * k) - 1, y0 = Math.floor(miny * k) - 1;
    const x1 = Math.min(Math.ceil(maxx * k) + 1, x0 + N), y1 = Math.min(Math.ceil(maxy * k) + 1, y0 + N);
    for (let py = y0; py < y1; py++) {
      const yy = (py + 0.5) / k, wy = mod(py, N) * N;
      let wx = mod(x0, N);
      for (let px = x0; px < x1; px++) {
        const xx = (px + 0.5) / k, idx = wy + wx, cur = best[idx];
        let d = 1e30, raw = 1e30, ny = 0;
        for (let e = 0; e < nt && d > cur; e++) {
          const dx = xx - TX[e], dy = yy - TY[e], r = Math.hypot(dx, dy), de = TK[e] === 1 ? TR[e] - r : r - TR[e];
          if (de < raw) { raw = de; ny = r > 1e-9 ? (TK[e] === 1 ? -dy : dy) / r : 0; }
          if (e === 0) d = de;
          else if (rc > 0) { const h = rc - Math.abs(d - de); d = (d < de ? d : de) - (h > 0 ? (h * h) / (4 * rc) : 0); }
          else if (de < d) d = de;
        }
        if (d > cur) { best[idx] = d; id[idx] = ci; eny[idx] = Math.round(ny * 127); }
        if (++wx === N) wx = 0;
      }
    }
  }
  for (let ci = 0; ci < nc; ci++) {
    const p = cells[ci].poly, nv = p.length / 2;
    let mx = 0, my = 0, minx = 1e30, maxx = -1e30, miny = 1e30, maxy = -1e30, longest = 0;
    for (let v = 0; v < nv; v++) {
      const x = p[2 * v], y = p[2 * v + 1], v2 = (v + 1) % nv, ex = p[2 * v2] - x, ey = p[2 * v2 + 1] - y, l = ex * ex + ey * ey;
      mx += x; my += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
      if (l > longest * 1.0001) { longest = l; cang[ci] = Math.atan2(ey, ex); } // направление длинной стороны (волокна дерева)
    }
    mx /= nv; my /= nv;
    cx[ci] = mod(mx, S); cy[ci] = mod(my, S); cw[ci] = maxx - minx; chh[ci] = maxy - miny;
    if (cells[ci].terms) { rasterTerms(cells[ci].terms, ci, minx, maxx, miny, maxy); continue; }
    // вписанный радиус от центра: отступы колотых граней не больше четверти — камень не схлопнется
    let inr = 1e30;
    for (let v = 0; v < nv; v++) {
      const v2 = (v + 1) % nv, ex = p[2 * v2] - p[2 * v], ey = p[2 * v2 + 1] - p[2 * v + 1], l = Math.hypot(ex, ey);
      if (l > 1e-9) inr = Math.min(inr, Math.abs((mx - p[2 * v]) * ey - (my - p[2 * v + 1]) * ex) / l);
    }
    const irrC = Math.min(irr, 0.25 * inr);
    let ne = 0;
    for (let v = 0; v < nv && ne < 64; v++) {
      const v2 = (v + 1) % nv;
      let x1 = p[2 * v], y1 = p[2 * v + 1], x2 = p[2 * v2], y2 = p[2 * v2 + 1];
      let nx = -(y2 - y1), ny = x2 - x1;
      const l = Math.hypot(nx, ny);
      if (l < 1e-9) continue;
      nx /= l; ny /= l;
      if (nx * (mx - x1) + ny * (my - y1) < 0) { nx = -nx; ny = -ny; }
      if (irr > 0) { // колотый край: свой отступ у каждого конца ребра
        const e1 = R() * irrC, e2 = R() * irrC;
        x1 += nx * e1; y1 += ny * e1; x2 += nx * e2; y2 += ny * e2;
        let qx = -(y2 - y1), qy = x2 - x1;
        const q = Math.hypot(qx, qy);
        qx /= q; qy /= q;
        if (qx * nx + qy * ny < 0) { qx = -qx; qy = -qy; }
        nx = qx; ny = qy;
      }
      A[ne] = nx; B[ne] = ny; C[ne] = -(nx * x1 + ny * y1); ne++;
    }
    if (!ne) continue;
    const pad = Math.ceil(zA * k) + 1;
    let x0 = Math.floor(minx * k) - pad, x1 = Math.ceil(maxx * k) + pad;
    let y0 = Math.floor(miny * k) - pad, y1 = Math.ceil(maxy * k) + pad;
    if (x1 - x0 > N) x1 = x0 + N;
    if (y1 - y0 > N) y1 = y0 + N;
    for (let py = y0; py < y1; py++) {
      const yy = (py + 0.5) / k, wy = mod(py, N) * N;
      for (let e = 0; e < ne; e++) { rowC[e] = B[e] * yy + C[e]; rowS[e] = A[e] * yy; }
      let wx = mod(x0, N);
      for (let px = x0; px < x1; px++) {
        const xx = (px + 0.5) / k, idx = wy + wx;
        const cur = best[idx];
        // зигзаг: сдвиг кромки нечётной функцией координаты вдоль неё — соседняя ячейка сдвигается так же
        let d = A[0] * xx + rowC[0] + (zA ? zA * tri((rowS[0] - B[0] * xx) / zP) : 0), raw = d, ei = 0;
        for (let e = 1; e < ne && d > cur; e++) {
          const de = A[e] * xx + rowC[e] + (zA ? zA * tri((rowS[e] - B[e] * xx) / zP) : 0);
          if (de < raw) { raw = de; ei = e; }
          if (rc > 0) {
            const h = rc - Math.abs(d - de);
            d = (d < de ? d : de) - (h > 0 ? (h * h) / (4 * rc) : 0);
          } else if (de < d) d = de;
        }
        if (d > cur) { best[idx] = d; id[idx] = ci; eny[idx] = Math.round(B[ei] * 127); }
        if (++wx === N) wx = 0;
      }
    }
  }
  return { best, id, eny, cx, cy, cw, ch: chh, cang };
}

// box-blur с заворотом краёв (2 прохода ≈ гаусс); вертикаль — построчно, через суммы столбцов
function blurWrap(src, N, r, out, tmp) {
  r = Math.max(1, Math.min(r, (N >> 1) - 1));
  const w = 1 / (2 * r + 1), col = new Float64Array(N);
  let a = src;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) {
      const o = y * N;
      let s = 0;
      for (let i = -r; i <= r; i++) s += a[o + (i < 0 ? i + N : i)];
      for (let x = 0; x < N; x++) {
        tmp[o + x] = s * w;
        let xa = x + r + 1, xs = x - r;
        if (xa >= N) xa -= N;
        if (xs < 0) xs += N;
        s += a[o + xa] - a[o + xs];
      }
    }
    col.fill(0);
    for (let i = -r; i <= r; i++) { const o = (i < 0 ? i + N : i) * N; for (let x = 0; x < N; x++) col[x] += tmp[o + x]; }
    for (let y = 0; y < N; y++) {
      let ya = y + r + 1, ys = y - r;
      if (ya >= N) ya -= N;
      if (ys < 0) ys += N;
      const o = y * N, oa = ya * N, os = ys * N;
      for (let x = 0; x < N; x++) { out[o + x] = col[x] * w; col[x] += tmp[oa + x] - tmp[os + x]; }
    }
    a = out;
  }
  return out;
}

export function layoutSignature(P, lay) {
  return JSON.stringify([P.layout, lay.rows, lay.cols, lay.cells.length, !!P.rotate, P.offset, lay.random ? [P.seed, P.jitter, P.relax] : 0]);
}

// ───────── главная функция ─────────
export function generate(Pin, N, opt) {
  opt = opt || {};
  const prog = opt.onProgress || (() => {});
  const T = { start: Date.now() };
  const P = Object.assign({}, DEFAULTS, Pin);
  P.size = Math.max(10, num(P.size, 4000));
  P.joint = Math.max(0, num(P.joint, 3));
  P.ex = Math.max(1, num(P.ex, 100)); P.ey = Math.max(1, num(P.ey, 100));
  const S = P.size;
  const mats = (P.materials && P.materials.length ? P.materials : DEFAULTS.materials).slice(0, 9);
  const nMat = mats.length;
  const checks = [];

  // правило вставок → кратность рядов
  let rules = null;
  if (P.colorMode === "rules") {
    rules = parseRules(P.rules, nMat);
    if (!rules.ok) checks.push({ level: "err", text: "Правило: " + rules.error });
  }
  const ruleCycle = rules && rules.ok && P.snapRows ? rules.lines.length : 1;

  prog("раскладка", 0.02);
  const Rl = rng(P.seed * 7919 + 11);
  const lay = buildLayout(P, ruleCycle, Rl);
  const cells = lay.cells, nc = cells.length;
  if (nc > 400000) throw new Error(`слишком много элементов (${nc}); увеличьте размер элемента`);
  const sig = layoutSignature(P, lay);

  // материалы по ячейкам
  const mat = new Uint8Array(nc);
  if (P.colorMode === "mix") {
    const w = mats.map((m) => Math.max(0, num(m.weight, 0)));
    const tot = w.reduce((a, b) => a + b, 0) || 1;
    const Rm = rng(P.seed * 7919 + 23);
    for (let c = 0; c < nc; c++) {
      let r = Rm() * tot, m = 0;
      while (m < nMat - 1 && r >= w[m]) { r -= w[m]; m++; }
      mat[c] = m;
    }
  } else if (P.colorMode === "parts") {
    for (let c = 0; c < nc; c++) mat[c] = (cells[c].part || 0) % nMat;
  } else if (rules && rules.ok) {
    for (let c = 0; c < nc; c++) mat[c] = ruleMat(rules, cells[c].row, cells[c].col);
  }
  let painted = 0;
  if (P.paint && P.paint.sig === sig && P.paint.map) {
    for (const key in P.paint.map) {
      const c = +key, m = +P.paint.map[key];
      if (c >= 0 && c < nc && m >= 0 && m < nMat) { mat[c] = m; painted++; }
    }
  }

  // ───────── слоты материалов: библиотека + текстуры + переопределения ─────────
  const Rc = rng(P.seed * 7919 + 37);
  const Rr = rng(P.seed * 7919 + 41);
  prog("растр", 0.08);
  const prof = PROFILE_BY_ID[P.jointProfile] || PROFILE_BY_ID.concave;
  const zig = prof.zig ? { amp: Math.max(1.5, P.joint * 1.1), period: Math.max(24, P.joint * 7) } : null;
  const ras = rasterize(cells, N, S, P, Rr, zig);
  const { best, id, eny } = ras;
  const TXS = opt.tex || { mats: [], fill: null };
  const k = N / S, mmpx = S / N;
  const levelFor = (maps, scale) => clamp(Math.floor(Math.log2(Math.max(1, (maps[0].w / scale) * mmpx))), 0, maps.length - 1);
  const slot = mats.map((sm, i) => {
    sm = sm || {};
    const lib = sm.lib ? MAT_BY_ID[sm.lib] || null : null;
    const tx = lib && lib.tex ? TXS.mats[i] || null : null;
    const o = {
      lib, tx, base: hexToRgb((lib && lib.color) || sm.color || "#888888"),
      vary: clamp(num(sm.vary, 0), 0, 50) / 100, // разброс тона — только если задан в тонкой настройке
      r0: lib ? lib.r[0] : 0, r1: lib ? lib.r[1] : num(sm.rough, 0.8),
      // metallic: свой у слота, иначе из библиотеки (0/1)
      metal: num(sm.metal != null ? sm.metal : lib ? lib.metal : 0, 0) >= 0.5 ? 255 : 0,
      emit: clamp(num(sm.emit, 0), 0, 1), emitTex: !!(lib && lib.emitTex),
      raise: num(sm.raise, 0), slope: num(sm.slope, 0),
      decor: Math.max(0, DECORS.findIndex((d) => d[0] === sm.decor)), decRGB: hexToRgb(sm.decorColor || "#2f3a4a").map((v) => v * 255),
      disp: lib ? lib.disp : 0, nrm: lib ? lib.nrm : 0, dir: !!(lib && lib.dir),
      pal: lib && lib.pal ? lib.pal.map(hexToRgb) : null, pmode: lib ? lib.pmode : null,
      fin: (lib && lib.fin) || {}, proc: lib ? lib.proc || (lib.tex ? null : "smooth") : null,
      scale: lib ? lib.scale / clamp(num(sm.texScale, 1), 0.05, 20) : 800, legacy: !lib, // масштаб ×2 — рисунок мельче вдвое
    };
    if (tx) {
      o.lev = levelFor(tx.color, o.scale);
      o.C = tx.color[o.lev]; o.Nm = tx.normal[Math.min(o.lev, tx.normal.length - 1)];
      const lg = levelFor(tx.rough, o.scale);
      o.Rg = tx.rough[lg]; o.Dp = tx.disp[Math.min(lg, tx.disp.length - 1)];
      o.meanLum = Math.max(0.02, tx.mean.lum);
      o.base = tx.mean.rgb.map((v) => v / 255);
      o.ku = o.C.w / o.scale; o.kn = o.Nm.w / o.scale; o.kr = o.Rg.w / o.scale;
    } else if (lib && lib.tex) o.proc = "smooth"; // текстура не загрузилась — ровный средний цвет
    // roughness слота: средняя по материалу = своя (если задана), рисунок карты сохраняется
    o.rMean = tx ? clamp(num(tx.roughMean, 0.5), 0, 1) : 0;
    o.roughAuto = clamp(o.r0 * o.rMean + o.r1, 0, 1);
    if (lib && sm.rough != null && sm.rough !== "" && Number.isFinite(+sm.rough)) o.r1 = clamp(+sm.rough, 0, 1) - o.r0 * o.rMean;
    return o;
  });

  // свойства ячеек
  const cr = new Float32Array(nc), cg = new Float32Array(nc), cb = new Float32Array(nc);
  const p2 = new Float32Array(nc * 3), cPh = new Float32Array(nc);
  const cRough = new Float32Array(nc), tx = new Float32Array(nc), ty = new Float32Array(nc), lift = new Float32Array(nc);
  const cCos = new Float32Array(nc), cSin = new Float32Array(nc), cOx = new Float32Array(nc), cOy = new Float32Array(nc);
  for (let c = 0; c < nc; c++) {
    const s = slot[mat[c]], v = s.vary;
    const tone = 1 + (Rc() * 2 - 1) * v;
    const tr = 1 + (Rc() * 2 - 1) * v * 0.15, tg = 1 + (Rc() * 2 - 1) * v * 0.15, tb = 1 + (Rc() * 2 - 1) * v * 0.15;
    let col = s.base;
    if (s.pal) {
      col = s.pal[Math.floor(Rc() * s.pal.length)];
      const c2 = s.pmode === "blend" ? s.pal[Math.floor(Rc() * s.pal.length)] : col;
      p2[c * 3] = c2[0] * 255 * tone; p2[c * 3 + 1] = c2[1] * 255 * tone; p2[c * 3 + 2] = c2[2] * 255 * tone;
      cPh[c] = Rc() * 2 - 1;
    }
    // текстурный материал без палитры: множитель к текстуре; иначе — цвет элемента
    if (s.tx && !s.pal) { cr[c] = tone * tr; cg[c] = tone * tg; cb[c] = tone * tb; }
    else { cr[c] = col[0] * 255 * tone * tr; cg[c] = col[1] * 255 * tone * tg; cb[c] = col[2] * 255 * tone * tb; }
    cRough[c] = (Rc() * 2 - 1) * 0.03;
    tx[c] = ((Rc() * 2 - 1) * num(P.tilt, 0)) / Math.max(ras.cw[c], 1);
    ty[c] = ((Rc() * 2 - 1) * num(P.tilt, 0)) / Math.max(ras.ch[c], 1);
    lift[c] = (Rc() * 2 - 1) * num(P.lift, 0);
    // текстура: свой случайный кусок и поворот для каждого элемента; дерево — вдоль длинной стороны
    const phi = s.dir ? ras.cang[c] + (Rc() < 0.5 ? 0 : Math.PI) : Math.floor(Rc() * 4) * (Math.PI / 2);
    cCos[c] = Math.cos(phi); cSin[c] = Math.sin(phi);
    cOx[c] = Rc() * s.scale; cOy[c] = Rc() * s.scale;
  }
  const cVoid = new Uint8Array(nc), cRot = new Uint8Array(nc), cAA = new Float32Array(nc);
  const Rd = rng(P.seed * 7919 + 53);
  for (let c = 0; c < nc; c++) {
    cVoid[c] = cells[c].void ? 1 : 0;
    cRot[c] = Math.floor(Rd() * 4);
    cAA[c] = 0.5 * Math.min(ras.cw[c], ras.ch[c]) * k;
  }

  // заполнение шва
  const fill = FILL_BY_ID[P.jointFill] || FILL_BY_ID.cement;
  const fx = fill.tex ? TXS.fill : null;
  const jc = hexToRgb(P.jointColor || fill.colors[0][1]), jRough = clamp(num(P.jointRough, fill.r), 0, 1);
  const jMetal = num(P.jointMetal, 0) >= 0.5 ? 255 : 0; // metallic шва (B в ERM)
  const jc0 = jc[0] * 255, jc1 = jc[1] * 255, jc2 = jc[2] * 255;
  let fC = null, fN = null, fR = null, fD = null, fku = 0, fkn = 0, fkr = 0, fMean = 1;
  if (fx) {
    const sE = S / Math.max(1, Math.round(S / fill.scale)); // целое число повторов на S — бесшовно
    const lv = levelFor(fx.color, sE), lg = levelFor(fx.rough, sE);
    fC = fx.color[lv]; fN = fx.normal[Math.min(lv, fx.normal.length - 1)]; fR = fx.rough[lg]; fD = fx.disp[Math.min(lg, fx.disp.length - 1)];
    fku = fC.w / sE; fkn = fN.w / sE; fkr = fR.w / sE; fMean = Math.max(0.02, fx.mean.lum);
  }
  const jGrain = fill.grain || 0;

  // карты
  prog("карты", 0.3);
  T.raster = Date.now() - T.start;
  const jh = P.joint / 2, ch = Math.max(0, num(P.chamfer, 0)), roundP = P.profile === "round";
  const D = Math.max(0, num(P.jointDepth, 4));
  const relief = Math.max(0, num(P.relief, 0)), relShade = 0.05 * Math.min(1, relief);
  const chipA = Math.max(0, num(P.chip, 0));
  const grainA = num(P.grain, 0) / 100, mottleA = num(P.mottle, 0) / 100, edgeDark = num(P.edgeDark, 0) / 100;
  const speck = clamp(num(P.speck, 0), 0, 100) / 100, spC = clamp(num(P.speckContrast, 0), 0, 100) / 100;
  const spThr = 2.4 - 1.5 * speck;
  const sd = (P.seed | 0) * 1013;
  const anyFin = slot.some((s) => s.fin.specks || s.fin.sparkle), anyBlend = slot.some((s) => s.pmode === "blend"), anyGlaze = slot.some((s) => s.proc === "glaze");
  const rGrain = noiseRows(S, N, 1.2, 1, sd + 1);
  const rMottle = noiseRows(S, N, 45, 2, sd + 2);
  const rRel = relief > 0 ? noiseRows(S, N, Math.max(0.5, num(P.reliefScale, 6)), 3, sd + 3) : null;
  const rChip = chipA > 0 || prof.ov ? noiseRows(S, N, 4, 2, sd + 4) : null;
  const rSpeck = speck > 0 || anyFin ? noiseRows(S, N, 1.4, 1, sd + 5) : null;
  const rRough = noiseRows(S, N, 6, 1, sd + 6);
  const rBlend = anyBlend ? noiseRows(S, N, 140, 2, sd + 7) : null;
  const rWob = anyGlaze ? noiseRows(S, N, 30, 2, sd + 8) : null;
  const rSpark = anyFin ? noiseRows(S, N, 1.1, 1, sd + 9) : null;
  const profH = (X, sgn, n) => (sgn || !prof.asym ? prof.h(sgn ? X : Math.abs(X), D, ch, n) : 0.5 * (prof.h(Math.abs(X), D, ch, n) + prof.h(-Math.abs(X), D, ch, n)));

  const NN = N * N;
  const diffuse = new Uint8ClampedArray(NN * 4);
  const erm = new Uint8ClampedArray(NN * 4);
  const normal = new Uint8ClampedArray(NN * 4); // пока: детальный уклон текстуры (x, y), потом — итоговая нормаль
  const h = new Float32Array(NN);
  const half = S / 2, cxs = ras.cx, cys = ras.cy;
  const zero = new Float32Array(N);
  const rgb = new Float32Array(3);
  let faceCnt = 0;
  for (let py = 0; py < N; py++) {
    const y = (py + 0.5) * mmpx;
    const G = rGrain(py), Mo = rMottle(py), Ro = rRough(py);
    const Re = rRel ? rRel(py) : zero, Ch = rChip ? rChip(py) : zero, Sp = rSpeck ? rSpeck(py) : null;
    const Bl = rBlend ? rBlend(py) : zero, Wb = rWob ? rWob(py) : zero, Sk = rSpark ? rSpark(py) : zero;
    for (let px = 0; px < N; px++) {
      const i = py * N + px, o = i * 4, x = (px + 0.5) * mmpx;
      const c = id[i], m = mat[c], s = slot[m];
      const g = G[px];
      // шов: нахлёст (нащельник, «плачущий» раствор) расширяет зону шва
      const sgn = eny[i] > 40 ? 1 : eny[i] < -40 ? -1 : 0;
      let jhE = jh;
      if (prof.ov) jhE += prof.cover ? prof.ov : sgn > 0 ? prof.ov * P.joint * clamp(0.35 + 0.5 * Ch[px], 0, 1.2) : 0;
      let dd = best[i] - jhE;
      if (chipA > 0) { const q = 0.5 + 0.35 * Ch[px]; dd -= chipA * (q < 0 ? 0 : q > 1 ? 1 : q); }
      let a = dd * k + 0.5;
      a = a < 0 || cVoid[c] ? 0 : a > 1 ? 1 : a;
      const t = ch > 0 ? (dd <= 0 ? 0 : dd < ch ? dd / ch : 1) : 1;
      const off = ch > 0 ? (roundP ? ch * (1 - Math.sqrt(1 - (1 - t) * (1 - t))) : ch * (1 - t)) : 0;
      let lx = x - cxs[c], ly = y - cys[c];
      if (lx > half) lx -= S; else if (lx < -half) lx += S;
      if (ly > half) ly -= S; else if (ly < -half) ly += S;
      const rel = Re[px];
      let hF = lift[c] + tx[c] * lx + ty[c] * ly + relief * rel * (0.55 + 0.45 * t) - off + 0.02 * g + s.raise;
      if (s.slope) hF += (s.slope * lx) / Math.max(ras.cw[c], 1);
      // профиль шва по поперечной координате X ∈ [−1, 1]
      const Xa = clamp(best[i] / Math.max(jhE, 1e-3), 0, 1), nW = clamp(0.5 + 0.4 * Ch[px], 0, 1);
      let hJ = profH(sgn >= 0 ? Xa : -Xa, sgn, nW);
      // раствор выше фаски — заполняет её (шов заподлицо закрывает фаску)
      if (a > 0 && dd < ch && !cVoid[c]) {
        const hEdge = profH(sgn >= 0 ? 1 : -1, sgn, nW);
        if (hEdge > hF - s.raise + 0.05 && !s.raise) { a = 0; hJ = hEdge; }
      }
      if (cVoid[c]) hJ = -3 * D - 15; // пустота ажурной кладки
      hJ += 0.25 * jGrain * g;

      // ── лицо элемента ──
      let r = 0, gg = 0, b = 0, rough = 0, emit = 0, dsx = 0, dsy = 0, disp = 0;
      let lum = (1 + grainA * g + mottleA * Mo[px]) * (1 - edgeDark * (1 - t)) * (1 + relShade * rel);
      if (a > 0) {
        if (s.tx) {
          const cs = cCos[c], sn = cSin[c];
          const tu = cs * lx + sn * ly + cOx[c], tv = -sn * lx + cs * ly + cOy[c];
          bil3(s.C, tu * s.ku, tv * s.ku, rgb);
          if (s.pal) {
            const w = s.pmode === "blend" ? clamp(0.5 + 0.9 * Bl[px] + 0.6 * cPh[c], 0, 1) : 0;
            const L = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 / s.meanLum;
            r = (cr[c] + (p2[c * 3] - cr[c]) * w) * L; gg = (cg[c] + (p2[c * 3 + 1] - cg[c]) * w) * L; b = (cb[c] + (p2[c * 3 + 2] - cb[c]) * w) * L;
          } else { r = rgb[0] * cr[c]; gg = rgb[1] * cg[c]; b = rgb[2] * cb[c]; }
          rough = (bil1(s.Rg, tu * s.kr, tv * s.kr) / 255) * s.r0 + s.r1 + cRough[c];
          const nx0 = bil1(s.Nm, tu * s.kn, tv * s.kn, 0) / 127.5 - 1, ny0 = bil1(s.Nm, tu * s.kn, tv * s.kn, 1) / 127.5 - 1;
          const nz0 = Math.sqrt(Math.max(0.05, 1 - nx0 * nx0 - ny0 * ny0));
          const sx = (-nx0 / nz0) * s.nrm, sy = (-ny0 / nz0) * s.nrm;
          dsx = cs * sx - sn * sy; dsy = sn * sx + cs * sy;
          disp = (bil1(s.Dp, tu * s.kr, tv * s.kr) / 255 - 0.5) * 2 * s.disp;
          if (s.emitTex && s.emit) emit = s.emit * Math.min(1, (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 / s.meanLum * 0.8);
        } else {
          if (s.pal && s.pmode === "blend") {
            const w = clamp(0.5 + 0.9 * Bl[px] + 0.6 * cPh[c], 0, 1);
            r = cr[c] + (p2[c * 3] - cr[c]) * w; gg = cg[c] + (p2[c * 3 + 1] - cg[c]) * w; b = cb[c] + (p2[c * 3 + 2] - cb[c]) * w;
          } else { r = cr[c]; gg = cg[c]; b = cb[c]; }
          rough = s.r1 + cRough[c] + (s.legacy ? 0.03 * Ro[px] : 0.01 * Ro[px]);
          if (s.proc === "glaze") { // зеллидж: волнистая глазурь, у кромок гуще и темнее
            hF += 0.35 * Wb[px];
            lum *= 0.8 + 0.2 * t + 0.03 * Wb[px];
          } else if (s.proc === "glass") lum *= 1 + 0.03 * Mo[px] + 0.02 * g;
          else if (s.proc === "smooth") lum *= 1 + 0.006 * Mo[px];
          if (s.emit) emit = s.emit;
        }
        if (s.fin.ribs) { // рифление вдоль длинной стороны
          const ang = ras.cang[c], across = -Math.sin(ang) * lx + Math.cos(ang) * ly, rb = s.fin.ribs;
          hF += rb.depth * (0.5 + 0.5 * Math.cos((2 * Math.PI * across) / rb.pitch)) * (1 + (rb.noise || 0) * 0.5 * Ch[px]) - rb.depth;
        }
        if (Sp && s.fin.specks && Sp[px] > 2.35 - s.fin.specks.dens * 1.2) { const sc = hexToRgbCached(s.fin.specks.color); r = sc[0]; gg = sc[1]; b = sc[2]; }
        if (s.fin.sparkle && Sk[px] > 2.7 - s.fin.sparkle) { rough = 0.06; lum *= 1.25; }
        if (Sp && s.legacy) {
          const sv = Sp[px];
          if (sv > spThr) { lum *= 1 - spC; rough += 0.04; }
          else if (sv < -spThr) { r += (255 - r) * spC; gg += (255 - gg) * spC; b += (255 - b) * spC; rough -= 0.04; }
        }
        if (s.decor) {
          // декор в локальных координатах элемента [-1, 1], поворот на 90°·k своё для каждого элемента
          let u = lx / (0.5 * Math.max(ras.cw[c], 1)), v = ly / (0.5 * Math.max(ras.ch[c], 1));
          const rt = cRot[c];
          if (rt === 1) { const t2 = u; u = v; v = -t2; } else if (rt === 2) { u = -u; v = -v; } else if (rt === 3) { const t2 = u; u = -v; v = t2; }
          let da = decorSD(s.decor, u, v) * cAA[c] + 0.5;
          da = da < 0 ? 0 : da > 1 ? 1 : da;
          if (da > 0) { const dcol = s.decRGB; r += (dcol[0] - r) * da; gg += (dcol[1] - gg) * da; b += (dcol[2] - b) * da; }
        }
        r *= lum; gg *= lum; b *= lum;
        faceCnt += a > 0.5 ? 1 : 0;
      }

      // ── шов ──
      let jr = jc0, jg = jc1, jb = jc2, jRo = jRough + 0.02 * g, jMet = jMetal, jdsx = 0, jdsy = 0, jdisp = 0;
      if (a < 1) {
        if (prof.insert && Xa < prof.insert && !cVoid[c]) { jr = 201; jg = 162; jb = 78; jRo = 0.25; jMet = 255; } // латунь
        else if (prof.cover && !cVoid[c]) { jr = 185; jg = 190; jb = 196; jRo = 0.35; jMet = 255; hJ += 0.1 * g; } // нащельник
        else if (fC) {
          bil3(fC, x * fku, y * fku, rgb);
          const L = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 / fMean;
          jr = jc0 * L; jg = jc1 * L; jb = jc2 * L;
          jRo = clamp(jRough + 0.15 * (bil1(fR, x * fkr, y * fkr) / 255 - 0.5), 0, 1);
          const nx0 = bil1(fN, x * fkn, y * fkn, 0) / 127.5 - 1, ny0 = bil1(fN, x * fkn, y * fkn, 1) / 127.5 - 1;
          const nz0 = Math.sqrt(Math.max(0.05, 1 - nx0 * nx0 - ny0 * ny0));
          jdsx = -nx0 / nz0 * 0.8; jdsy = -ny0 / nz0 * 0.8;
          jdisp = (bil1(fD, x * fkr, y * fkr) / 255 - 0.5) * (fill.id === "grass" ? 5 : 1.2);
        } else { const jl = 1 + jGrain * g; jr *= jl; jg *= jl; jb *= jl; }
        if (cVoid[c]) { jr *= 0.28; jg *= 0.28; jb *= 0.28; jRo = 1; }
      }

      h[i] = hJ + (hF - hJ) * a;
      diffuse[o] = jr + (r - jr) * a;
      diffuse[o + 1] = jg + (gg - jg) * a;
      diffuse[o + 2] = jb + (b - jb) * a;
      diffuse[o + 3] = 255;
      erm[o] = emit * a * 255;
      erm[o + 1] = clamp(jRo + (rough - jRo) * a, 0, 1) * 255;
      erm[o + 2] = a >= 0.5 ? s.metal : jMet;
      erm[o + 3] = 255;
      // детальный уклон (текстура) и рельеф карты высот — до итоговой нормали
      const ex = jdsx + (dsx - jdsx) * a, ey = jdsy + (dsy - jdsy) * a;
      normal[o] = 128 + clamp(ex * 63, -127, 127);
      normal[o + 1] = 128 + clamp(ey * 63, -127, 127);
      best[i] = jdisp + (disp - jdisp) * a; // best больше не нужен — храним в нём рельеф текстуры
    }
    if ((py & 63) === 0) prog("карты", 0.3 + 0.45 * (py / N));
  }
  T.shade = Date.now() - T.start;

  // Normal DX (Y−): n = (−dh/dx, −dh/dy, 1), y вниз по картинке; + детальный уклон текстур
  prog("normal", 0.8);
  const sN = (num(P.normalStrength, 1) * k) / 2;
  for (let y = 0; y < N; y++) {
    const ym = (y === 0 ? N - 1 : y - 1) * N, yp = (y === N - 1 ? 0 : y + 1) * N, yo = y * N;
    for (let x = 0; x < N; x++) {
      const xm = x === 0 ? N - 1 : x - 1, xp = x === N - 1 ? 0 : x + 1, o = (yo + x) * 4;
      const gx = (h[yo + xp] - h[yo + xm]) * sN + ((normal[o] - 128) / 63) * num(P.normalStrength, 1);
      const gy = (h[yp + x] - h[ym + x]) * sN + ((normal[o + 1] - 128) / 63) * num(P.normalStrength, 1);
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
      normal[o] = (0.5 - 0.5 * gx * inv) * 255 + 0.5;
      normal[o + 1] = (0.5 - 0.5 * gy * inv) * 255 + 0.5;
      normal[o + 2] = (0.5 + 0.5 * inv) * 255 + 0.5;
      normal[o + 3] = 255;
    }
  }
  // AO по геометрии (швы, выступы, наклоны) → в Diffuse; микрорельеф текстур сюда не идёт — без шума
  const aoA = clamp(num(P.ao, 0), 0, 100) / 100;
  if (aoA > 0) {
    prog("AO", 0.86);
    const tmp = new Float32Array(NN), bl = new Float32Array(NN);
    for (const [rad, w] of [[Math.max(1, Math.round(2 * k)), 0.16], [Math.max(2, Math.round(10 * k)), 0.05]]) {
      blurWrap(h, N, rad, bl, tmp);
      for (let i = 0; i < NN; i++) {
        const v = bl[i] - h[i];
        if (v <= 0) continue;
        const ao = Math.max(0.15, 1 - aoA * w * v), o = i * 4;
        diffuse[o] *= ao; diffuse[o + 1] *= ao; diffuse[o + 2] *= ao;
      }
    }
  }
  // рельеф карт высот текстур — в высоту (для Height), нормаль его уже учла через детальный уклон
  let hMin = 1e30, hMax = -1e30;
  for (let i = 0; i < NN; i++) { const hv = (h[i] += best[i]); if (hv < hMin) hMin = hv; if (hv > hMax) hMax = hv; }

  // ───────── проверки ─────────
  prog("проверки", 0.95);
  checks.push({
    level: lay.dev > 0.15 ? "warn" : "ok",
    text: `Только целые элементы: ${lay.countText}; ${lay.elemText}` + (lay.dev > 0.15 ? " — подгонка больше 15 %" : ""),
  });
  if (P.layout === "running" && !parseOffset(P.offset).rand) {
    const q = parseOffset(P.offset).q;
    checks.push({ level: lay.rows % q === 0 ? "ok" : "err", text: `Смещение ${P.offset}: рядов ${lay.rows} ${lay.rows % q === 0 ? "кратно" : "НЕ кратно"} ${q} — ${lay.rows % q === 0 ? "сдвиг замыкается" : "шов на стыке по Y"}` });
  }
  if (rules && rules.ok) {
    const Ls = rules.lines, n = Ls.length;
    const okRows = lay.rows % n === 0;
    checks.push({ level: okRows ? "ok" : "err", text: `Рядов ${lay.rows} ${okRows ? "кратно" : "НЕ кратно"} циклу правила (${n} строк) — ${okRows ? "чередование сходится на стыке" : "сбой чередования на стыке по Y"}` });
    if (lay.kind === "grid") {
      Ls.forEach((L, li) => {
        if (L.type === "solid") return;
        const okX = lay.cols % L.period === 0;
        checks.push({ level: okX ? "ok" : "warn", text: `Строка ${li + 1} «${L.src}»: период ${L.period} ${okX ? "делит" : "не делит"} ${lay.cols} элементов ряда — ${okX ? "рисунок замыкается по X" : "сбой рисунка на стыке по X"}` });
        if (L.shift && okRows) {
          const occ = lay.rows / n, okS = mod(L.shift * occ, L.period) === 0;
          checks.push({ level: okS ? "ok" : "warn", text: `Строка ${li + 1}: сдвиг ${L.shift} × ${occ} повторов ${okS ? "замыкается" : `не замыкается (нужно рядов кратно ${n * L.period / gcd(L.period, Math.abs(L.shift))})`} на стыке по Y` });
        }
      });
    }
  }
  if (P.colorMode !== "single" || painted) {
    // вставки (не материал 1) не касаются ни сторонами, ни углами — по карте владельцев
    const pairs = new Set();
    for (let y = 0; y < N; y++) {
      const yo = y * N, yd = (y === N - 1 ? 0 : y + 1) * N;
      for (let x = 0; x < N; x++) {
        const a = id[yo + x];
        if (!mat[a]) continue;
        const xr = x === N - 1 ? 0 : x + 1, xl = x === 0 ? N - 1 : x - 1;
        let b = id[yo + xr];
        if (b !== a && mat[b]) pairs.add(a < b ? a * nc + b : b * nc + a);
        b = id[yd + x];
        if (b !== a && mat[b]) pairs.add(a < b ? a * nc + b : b * nc + a);
        b = id[yd + xr];
        if (b !== a && mat[b]) pairs.add(a < b ? a * nc + b : b * nc + a);
        b = id[yd + xl];
        if (b !== a && mat[b]) pairs.add(a < b ? a * nc + b : b * nc + a);
      }
    }
    checks.push({
      level: pairs.size ? (P.noTouch ? "warn" : "info") : "ok",
      text: pairs.size ? `Вставки соприкасаются: ${pairs.size} пар(ы) (стороны/углы, с учётом стыка)` : "Вставки не соприкасаются ни сторонами, ни углами (с учётом стыка)",
    });
  }
  // бесшовность: перепад высоты на стыке не выбивается из перепадов внутри
  const seam = (axis) => {
    const diffs = new Float64Array(N);
    for (let a = 0; a < N; a++) {
      const a2 = a === N - 1 ? 0 : a + 1;
      let sum = 0;
      for (let b = 0; b < N; b++) sum += axis ? Math.abs(h[a * N + b] - h[a2 * N + b]) : Math.abs(h[b * N + a] - h[b * N + a2]);
      diffs[a] = sum / N;
    }
    const edge = diffs[N - 1], inner = Array.from(diffs.subarray(0, N - 1)).sort((p, q) => p - q);
    const ref = inner[Math.floor(inner.length * 0.995)] || 0;
    return { ok: edge <= ref * 1.1 + 1e-6, edge, ref };
  };
  const sx = seam(0), sy = seam(1);
  checks.push({ level: sx.ok && sy.ok ? "ok" : "err", text: `Бесшовность: перепад на стыке X ${sx.edge.toFixed(2)} / Y ${sy.edge.toFixed(2)} мм ≤ типичного внутри (${sx.ref.toFixed(2)} / ${sy.ref.toFixed(2)})` });
  checks.push({ level: "info", text: `Шов ${(100 - (faceCnt / NN) * 100).toFixed(1)} % площади · высота от ${hMin.toFixed(1)} до ${hMax.toFixed(1)} мм` });

  let height16 = null;
  if (opt.height16) {
    height16 = new Uint16Array(NN);
    const sc = hMax > hMin ? 65535 / (hMax - hMin) : 0;
    for (let i = 0; i < NN; i++) height16[i] = (h[i] - hMin) * sc + 0.5;
  }
  prog("готово", 1);
  return {
    N, diffuse, erm, normal, height16, ids: opt.ids ? id : null, mat, sig, checks,
    info: {
      countText: lay.countText, elemText: lay.elemText, cells: nc, rows: lay.rows, cols: lay.cols, painted, hMin, hMax,
      ms: Date.now() - T.start, msRaster: T.raster, msShade: T.shade,
      slots: slot.map((s) => ({ roughAuto: Math.round(s.roughAuto * 100) / 100, metal: s.metal ? 1 : 0 })),
    },
  };
}

// ───────── миниатюры пресетов ─────────
// Параметры для миниатюры: та же раскладка на плоскости plane × plane мм (по умолчанию 1 × 1 м)
export function thumbParams(preset, plane, res) {
  const P = JSON.parse(JSON.stringify(Object.assign({}, DEFAULTS, preset.p)));
  plane = plane || preset.thumb || 1000;
  const sc = plane / (num(P.size, 4000) || 4000);
  P.size = plane;
  if (P.countX > 0) P.countX = Math.max(1, Math.round(P.countX * sc));
  if (P.countY > 0) P.countY = Math.max(1, Math.round(P.countY * sc));
  // шов на миниатюре не тоньше ~0.6 px (px — сторона/res): шаг элемента тот же, элемент чуть меньше
  const jMin = (plane / (res || 160)) * 0.6, d = jMin - num(P.joint, 0);
  if (d > 0 && P.layout !== "voronoi") {
    P.joint = jMin;
    P.ex = Math.max(1, P.ex - d); P.ey = Math.max(1, P.ey - d);
    if (P.layout === "bond") P.ez = Math.max(1, num(P.ez, 65) - d);
  }
  // нейтральный вид: серые тона по слотам, без текстур; шов — из подсказки узора
  const NEUTRAL = ["#9c9b97", "#d0cfca", "#5e5d5a", "#b6b5b0", "#7b7a76", "#e3e2dd", "#484745", "#8b8a86", "#c3c2bd"];
  P.materials = (P.materials && P.materials.length ? P.materials : [{}]).map((m, i) => {
    const col = NEUTRAL[i % NEUTRAL.length], light = hexToRgb(col)[0] > 0.55;
    return { color: col, vary: 4, rough: 0.8, weight: m.weight || 1, raise: m.raise || 0, slope: m.slope || 0, decor: m.decor || "none", decorColor: light ? "#4a4947" : "#dddcd7" };
  });
  const j = preset.j || {};
  P.jointFill = "cement";
  P.jointColor = preset.cat === "brick" ? "#c6c3bc" : "#7d7b77";
  P.jointProfile = j.profile || "concave";
  P.jointDepth = j.depth == null ? 3 : j.depth;
  P.grain = 2; P.mottle = 1; P.speck = 0;
  for (const kk of ["chamfer", "corner", "irregular", "chip", "tilt", "lift", "relief", "edgeDark"]) P[kk] = 0;
  P.paint = null;
  return P;
}

// освещённый вид (свет сверху слева), с уменьшением в down раз — для миниатюр и проверок
export function litImage(r, N, down) {
  down = down || 1;
  const M = Math.floor(N / down), out = new Uint8ClampedArray(M * M * 4);
  const L = [-0.55, -0.55, 0.63], ll = Math.hypot(...L), Lx = L[0] / ll, Ly = L[1] / ll, Lz = L[2] / ll;
  const Hl = Math.hypot(Lx, Ly, Lz + 1), Hx = Lx / Hl, Hy = Ly / Hl, Hz = (Lz + 1) / Hl;
  const acc = new Float32Array(3);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    acc.fill(0);
    for (let dy = 0; dy < down; dy++) for (let dx = 0; dx < down; dx++) {
      const i = ((y * down + dy) * N + x * down + dx) * 4;
      const nx = r.normal[i] / 127.5 - 1, ny = r.normal[i + 1] / 127.5 - 1, nz = r.normal[i + 2] / 127.5 - 1;
      const ndl = Math.max(0, nx * Lx + ny * Ly + nz * Lz), rough = Math.max(0.05, r.erm[i + 1] / 255);
      const ndh = Math.max(0, nx * Hx + ny * Hy + nz * Hz), sp = Math.pow(ndh, 2 / (rough ** 4) + 1) * (1 - rough) * 0.6;
      for (let c = 0; c < 3; c++) {
        const al = Math.pow(r.diffuse[i + c] / 255, 2.2), v = al * (ndl * 1.55 + 0.14) + sp + al * (r.erm[i] / 255) * 2;
        acc[c] += v / (1 + v * 0.35);
      }
    }
    const o = (y * M + x) * 4, n = down * down;
    for (let c = 0; c < 3; c++) out[o + c] = 255 * Math.pow(Math.min(1, acc[c] / n * 1.2), 1 / 2.2);
    out[o + 3] = 255;
  }
  return out;
}

export const _internal = { noiseRows, rasterize, polyCentroid };
