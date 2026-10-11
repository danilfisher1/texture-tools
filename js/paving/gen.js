// Генератор тайловых PBR-текстур мощения: раскладка → материалы → растр → карты.
// Единицы — мм. Текстура покрывает S×S мм плоскости и имеет N×N px.
// Бесшовность по построению: раскладка замыкается на целом числе элементов/модулей,
// шум — решётка с целым периодом на S, производные и размытие — с заворотом краёв.
// Карты: Diffuse (sRGB), ERM (R = emissive, G = roughness, B = metallic 0/1), Normal DX (Y−), Height (мм).

const SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3);

export const LAYOUTS = [
  { id: "stack", name: "Шов в шов" },
  { id: "running", name: "Вразбежку (смещение рядов)" },
  { id: "herring90", name: "Ёлочка 90°" },
  { id: "herring45", name: "Ёлочка 45°" },
  { id: "basket", name: "Корзинка" },
  { id: "hex", name: "Шестигранник" },
  { id: "voronoi", name: "Плитняк / мозаика" },
];

export const DEFAULTS = {
  size: 4000, seed: 1,
  layout: "running", ex: 100, ey: 300, joint: 3, countX: 0, countY: 0,
  offset: "1/2", jitter: 0, relax: 1, rotate: false, snapRows: true,
  chamfer: 2, profile: "round", chip: 0, irregular: 0, corner: 0,
  relief: 0.15, reliefScale: 6, tilt: 0.3, lift: 0.2,
  grain: 3.5, mottle: 1.2, speck: 0, speckContrast: 30, edgeDark: 12,
  jointColor: "#4d4a45", jointRough: 0.95, jointDepth: 4,
  normalStrength: 1, ao: 50,
  materials: [
    { color: "#6e7070", vary: 4, rough: 0.84, metal: 0, emit: 0, weight: 1 },
    { color: "#cecfcb", vary: 4, rough: 0.84, metal: 0, emit: 0, weight: 1 },
  ],
  colorMode: "single",
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

// Ёлочка: пара «вертикальный + горизонтальный» кирпич, решётка (W, W) и (L, −L), L = k·W
function layoutHerring90(P, S) {
  const j = P.joint, { L, W } = brickRatio(P), k = Math.max(2, brickRatio(P).k);
  const n = fit(S, 2 * k * (W + j), P.countX);
  const M = 2 * n * k, Wp = S / M, Lp = k * Wp;
  const cells = [], seen = new Set();
  for (let b = 0; b < n; b++) for (let a = 0; a < M; a++) {
    const tu = mod(a + b * k, M), tv = mod(a - b * k, M), key = tu * M + tv;
    if (seen.has(key)) throw new Error("ёлочка: повтор пары " + key);
    seen.add(key);
    const tx = tu * Wp, ty = tv * Wp;
    cells.push({ poly: rect(tx, ty, tx + Wp, ty + Lp), row: b, col: 2 * a });
    cells.push({ poly: rect(tx + Wp, ty, tx + Wp + Lp, ty + Wp), row: b, col: 2 * a + 1 });
  }
  return {
    cells, kind: "herring", rows: n, cols: 2 * M, rowMult: 1,
    countText: `${n} × ${n} модулей ${(2 * Lp).toFixed(0)} мм, ${cells.length} шт (L = ${k}·W)`,
    elemText: `элемент ${(Lp - j).toFixed(1)} × ${(Wp - j).toFixed(1)} мм (номинал ${L} × ${W}: ${pct(Lp, L + j)} / ${pct(Wp, W + j)})`,
    dev: Math.max(Math.abs(Lp / (L + j) - 1), Math.abs(Wp / (W + j) - 1)),
  };
}

// Та же ёлочка, повёрнутая на −45°: решётка становится прямоугольной W√2 × L√2
function layoutHerring45(P, S) {
  const j = P.joint, { L, W } = brickRatio(P), k = Math.max(2, brickRatio(P).k);
  const ny = fit(S, k * (W + j) * SQ2, P.countY), nx = k * ny;
  const Wp = S / (nx * SQ2), Lp = k * Wp;
  const rot = (pts) => { const o = []; for (let i = 0; i < pts.length; i += 2) o.push((pts[i] + pts[i + 1]) / SQ2, (pts[i + 1] - pts[i]) / SQ2); return o; };
  const V = rot(rect(0, 0, Wp, Lp)), H = rot(rect(Wp, 0, Wp + Lp, Wp));
  const cells = [];
  for (let b = 0; b < ny; b++) for (let a = 0; a < nx; a++) {
    const tx = a * Wp * SQ2, ty = b * Lp * SQ2;
    cells.push({ poly: V.map((v, i) => v + (i & 1 ? ty : tx)), row: b, col: 2 * a });
    cells.push({ poly: H.map((v, i) => v + (i & 1 ? ty : tx)), row: b, col: 2 * a + 1 });
  }
  return {
    cells, kind: "herring", rows: ny, cols: 2 * nx, rowMult: 1,
    countText: `${nx} × ${ny} модулей, ${cells.length} шт (L = ${k}·W)`,
    elemText: `элемент ${(Lp - j).toFixed(1)} × ${(Wp - j).toFixed(1)} мм (номинал ${L} × ${W}: ${pct(Lp, L + j)} / ${pct(Wp, W + j)})`,
    dev: Math.max(Math.abs(Lp / (L + j) - 1), Math.abs(Wp / (W + j) - 1)),
  };
}

function layoutBasket(P, S) {
  const j = P.joint, { L, W, k } = brickRatio(P);
  const n = fit(S, 2 * k * (W + j), P.countX);
  const B = 2 * n, Wp = S / (B * k), Lp = k * Wp;
  const cells = [];
  for (let bj = 0; bj < B; bj++) for (let bi = 0; bi < B; bi++) for (let m = 0; m < k; m++) {
    if ((bi + bj) % 2 === 0) cells.push({ poly: rect(bi * Lp, bj * Lp + m * Wp, (bi + 1) * Lp, bj * Lp + (m + 1) * Wp), row: bj * k + m, col: bi });
    else cells.push({ poly: rect(bi * Lp + m * Wp, bj * Lp, bi * Lp + (m + 1) * Wp, (bj + 1) * Lp), row: bj * k, col: bi * k + m });
  }
  return {
    cells, kind: "basket", rows: B * k, cols: B * k, rowMult: 1,
    countText: `${B} × ${B} блоков по ${k} шт, ${cells.length} шт`,
    elemText: `элемент ${(Lp - j).toFixed(1)} × ${(Wp - j).toFixed(1)} мм (номинал ${L} × ${W}: ${pct(Lp, L + j)} / ${pct(Wp, W + j)})`,
    dev: Math.max(Math.abs(Lp / (L + j) - 1), Math.abs(Wp / (W + j) - 1)),
  };
}

// Шестигранник «вершиной вверх»: X — размер под ключ; период X = F, Y = √3·F (2 ряда)
function layoutHex(P, S, ruleCycle) {
  const j = P.joint, F = P.ex + j, R0 = F / SQ3;
  const nx = fit(S, F, P.countX);
  const pairMult = ruleCycle % 2 === 0 ? ruleCycle / 2 : ruleCycle;
  const nr2 = fit(S, SQ3 * F, P.countY ? Math.ceil(P.countY / 2) : 0, pairMult);
  const sx = S / (nx * F), sy = S / (nr2 * SQ3 * F);
  const cells = [];
  for (let r = 0; r < 2 * nr2; r++) for (let c = 0; c < nx; c++) {
    const cx = c * F + (r & 1) * F / 2, cy = r * 1.5 * R0, poly = [];
    for (let v = 0; v < 6; v++) {
      const t = (Math.PI / 3) * v - Math.PI / 2;
      poly.push((cx + R0 * Math.cos(t)) * sx, (cy + R0 * Math.sin(t)) * sy);
    }
    cells.push({ poly, row: r, col: c });
  }
  return {
    cells, kind: "grid", rows: 2 * nr2, cols: nx, rowMult: 2,
    countText: `${nx} × ${2 * nr2} шт`,
    elemText: `под ключ ${(F * sx - j).toFixed(1)} мм (номинал ${P.ex}: ${pct(F * sx, F)}), сжатие по Y ${pct(sy, sx)}`,
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
    case "hex": lay = layoutHex(P, S, ruleCycle); break;
    case "voronoi": lay = layoutVoronoi(P, S, R); break;
    default: lay = layoutRows(P, S, ruleCycle, R);
  }
  if (P.rotate) for (const c of lay.cells) {
    const p = c.poly;
    for (let i = 0; i < p.length; i += 2) { const t = p[i]; p[i] = p[i + 1]; p[i + 1] = t; }
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

// ───────── растр: владелец пикселя и расстояние до края ячейки ─────────
function rasterize(cells, N, S, P, R) {
  const k = N / S;
  const best = new Float32Array(N * N).fill(-1e30);
  const id = new Int32Array(N * N);
  const irr = Math.max(0, num(P.irregular, 0));
  const rc = Math.max(0, num(P.corner, 0)) * 1.17; // smin-ширина ≈ радиус скругления
  const A = new Float64Array(64), B = new Float64Array(64), C = new Float64Array(64), rowC = new Float64Array(64);
  const cx = new Float32Array(cells.length), cy = new Float32Array(cells.length);
  const cw = new Float32Array(cells.length), chh = new Float32Array(cells.length);
  for (let ci = 0; ci < cells.length; ci++) {
    const p = cells[ci].poly, nv = p.length / 2;
    let mx = 0, my = 0, minx = 1e30, maxx = -1e30, miny = 1e30, maxy = -1e30;
    for (let v = 0; v < nv; v++) {
      const x = p[2 * v], y = p[2 * v + 1];
      mx += x; my += y;
      if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    mx /= nv; my /= nv;
    cx[ci] = mod(mx, S); cy[ci] = mod(my, S); cw[ci] = maxx - minx; chh[ci] = maxy - miny;
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
    let x0 = Math.floor(minx * k) - 1, x1 = Math.ceil(maxx * k) + 1;
    let y0 = Math.floor(miny * k) - 1, y1 = Math.ceil(maxy * k) + 1;
    if (x1 - x0 > N) x1 = x0 + N;
    if (y1 - y0 > N) y1 = y0 + N;
    for (let py = y0; py < y1; py++) {
      const yy = (py + 0.5) / k, wy = mod(py, N) * N;
      for (let e = 0; e < ne; e++) rowC[e] = B[e] * yy + C[e];
      let wx = mod(x0, N);
      for (let px = x0; px < x1; px++) {
        const xx = (px + 0.5) / k, idx = wy + wx;
        const cur = best[idx];
        let d = A[0] * xx + rowC[0];
        for (let e = 1; e < ne && d > cur; e++) {
          const de = A[e] * xx + rowC[e];
          if (rc > 0) {
            const h = rc - Math.abs(d - de);
            d = (d < de ? d : de) - (h > 0 ? (h * h) / (4 * rc) : 0);
          } else if (de < d) d = de;
        }
        if (d > cur) { best[idx] = d; id[idx] = ci; }
        if (++wx === N) wx = 0;
      }
    }
  }
  return { best, id, cx, cy, cw, ch: chh };
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

  // свойства ячеек
  const Rc = rng(P.seed * 7919 + 37);
  const Rr = rng(P.seed * 7919 + 41);
  prog("растр", 0.08);
  const ras = rasterize(cells, N, S, P, Rr);
  const { best, id } = ras;
  const cr = new Float32Array(nc), cg = new Float32Array(nc), cb = new Float32Array(nc);
  const cRough = new Float32Array(nc), tx = new Float32Array(nc), ty = new Float32Array(nc), lift = new Float32Array(nc);
  const base = mats.map((m) => hexToRgb(m.color));
  for (let c = 0; c < nc; c++) {
    const m = mat[c], v = clamp(num(mats[m].vary, 0), 0, 50) / 100;
    const tone = 1 + (Rc() * 2 - 1) * v;
    cr[c] = base[m][0] * tone * (1 + (Rc() * 2 - 1) * v * 0.15);
    cg[c] = base[m][1] * tone * (1 + (Rc() * 2 - 1) * v * 0.15);
    cb[c] = base[m][2] * tone * (1 + (Rc() * 2 - 1) * v * 0.15);
    cRough[c] = clamp(num(mats[m].rough, 0.8) + (Rc() * 2 - 1) * 0.03, 0, 1);
    tx[c] = ((Rc() * 2 - 1) * num(P.tilt, 0)) / Math.max(ras.cw[c], 1);
    ty[c] = ((Rc() * 2 - 1) * num(P.tilt, 0)) / Math.max(ras.ch[c], 1);
    lift[c] = (Rc() * 2 - 1) * num(P.lift, 0);
  }
  const mMetal = mats.map((m) => (num(m.metal, 0) >= 0.5 ? 255 : 0));
  const mEmit = mats.map((m) => clamp(num(m.emit, 0), 0, 1));

  // карты
  prog("карты", 0.3);
  T.raster = Date.now() - T.start;
  const k = N / S, mmpx = S / N;
  const jh = P.joint / 2, ch = Math.max(0, num(P.chamfer, 0)), roundP = P.profile === "round";
  const jd = Math.max(0, num(P.jointDepth, 4));
  const relief = Math.max(0, num(P.relief, 0)), relShade = 0.05 * Math.min(1, relief);
  const chipA = Math.max(0, num(P.chip, 0));
  const grainA = num(P.grain, 0) / 100, mottleA = num(P.mottle, 0) / 100, edgeDark = num(P.edgeDark, 0) / 100;
  const speck = clamp(num(P.speck, 0), 0, 100) / 100, spC = clamp(num(P.speckContrast, 0), 0, 100) / 100;
  const spThr = 2.4 - 1.5 * speck;
  const sd = (P.seed | 0) * 1013;
  const rGrain = noiseRows(S, N, 1.2, 1, sd + 1);
  const rMottle = noiseRows(S, N, 45, 2, sd + 2);
  const rRel = relief > 0 ? noiseRows(S, N, Math.max(0.5, num(P.reliefScale, 6)), 3, sd + 3) : null;
  const rChip = chipA > 0 ? noiseRows(S, N, 4, 2, sd + 4) : null;
  const rSpeck = speck > 0 ? noiseRows(S, N, 1.4, 1, sd + 5) : null;
  const rRough = noiseRows(S, N, 6, 1, sd + 6);
  const jc = hexToRgb(P.jointColor), jRough = clamp(num(P.jointRough, 0.95), 0, 1);
  const jc0 = jc[0] * 255, jc1 = jc[1] * 255, jc2 = jc[2] * 255;
  for (let c = 0; c < nc; c++) { cr[c] *= 255; cg[c] *= 255; cb[c] *= 255; }

  const NN = N * N;
  const diffuse = new Uint8ClampedArray(NN * 4);
  const erm = new Uint8ClampedArray(NN * 4);
  const normal = new Uint8ClampedArray(NN * 4);
  const h = new Float32Array(NN);
  const half = S / 2, cxs = ras.cx, cys = ras.cy;
  const zero = new Float32Array(N);
  let faceCnt = 0;
  for (let py = 0; py < N; py++) {
    const y = (py + 0.5) * mmpx;
    const G = rGrain(py), Mo = rMottle(py), Ro = rRough(py);
    const Re = rRel ? rRel(py) : zero, Ch = rChip ? rChip(py) : zero, Sp = rSpeck ? rSpeck(py) : null;
    for (let px = 0; px < N; px++) {
      const i = py * N + px, o = i * 4, x = (px + 0.5) * mmpx;
      const c = id[i], m = mat[c];
      let dd = best[i] - jh;
      if (chipA > 0) { const q = 0.5 + 0.35 * Ch[px]; dd -= chipA * (q < 0 ? 0 : q > 1 ? 1 : q); }
      let a = dd * k + 0.5;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      const t = ch > 0 ? (dd <= 0 ? 0 : dd < ch ? dd / ch : 1) : 1;
      const off = ch > 0 ? (roundP ? ch * (1 - Math.sqrt(1 - (1 - t) * (1 - t))) : ch * (1 - t)) : 0;
      let lx = x - cxs[c], ly = y - cys[c];
      if (lx > half) lx -= S; else if (lx < -half) lx += S;
      if (ly > half) ly -= S; else if (ly < -half) ly += S;
      const g = G[px], rel = Re[px];
      const hF = lift[c] + tx[c] * lx + ty[c] * ly + relief * rel * (0.55 + 0.45 * t) - off + 0.02 * g;
      const hJ = -jd + 0.25 * g;
      h[i] = hJ + (hF - hJ) * a;
      if (a > 0.5) faceCnt++;

      // цвет
      let lum = (1 + grainA * g + mottleA * Mo[px]) * (1 - edgeDark * (1 - t)) * (1 + relShade * rel);
      let r = cr[c], gg = cg[c], b = cb[c], rough = cRough[c] + 0.03 * Ro[px];
      if (Sp) {
        const s = Sp[px];
        if (s > spThr) { lum *= 1 - spC; rough += 0.04; }
        else if (s < -spThr) { r += (255 - r) * spC; gg += (255 - gg) * spC; b += (255 - b) * spC; rough -= 0.04; }
      }
      const jl = 1 + 0.12 * g;
      diffuse[o] = jc0 * jl + (r * lum - jc0 * jl) * a;
      diffuse[o + 1] = jc1 * jl + (gg * lum - jc1 * jl) * a;
      diffuse[o + 2] = jc2 * jl + (b * lum - jc2 * jl) * a;
      diffuse[o + 3] = 255;
      const jr = jRough + 0.02 * g;
      erm[o] = mEmit[m] * a * 255;
      erm[o + 1] = (jr + (rough - jr) * a) * 255;
      erm[o + 2] = a >= 0.5 ? mMetal[m] : 0;
      erm[o + 3] = 255;
    }
    if ((py & 63) === 0) prog("карты", 0.3 + 0.45 * (py / N));
  }
  T.shade = Date.now() - T.start;

  // AO от высоты → в Diffuse
  const aoA = clamp(num(P.ao, 0), 0, 100) / 100;
  if (aoA > 0) {
    prog("AO", 0.78);
    const tmp = best, bl = new Float32Array(NN), cav = new Float32Array(NN); // best больше не нужен
    blurWrap(h, N, Math.max(1, Math.round(2 * k)), bl, tmp);
    for (let i = 0; i < NN; i++) { const v = bl[i] - h[i]; cav[i] = v > 0 ? 0.16 * v : 0; }
    blurWrap(h, N, Math.max(2, Math.round(10 * k)), bl, tmp);
    for (let i = 0; i < NN; i++) {
      const v = bl[i] - h[i], ao = clamp(1 - aoA * (cav[i] + (v > 0 ? 0.05 * v : 0)), 0.15, 1), o = i * 4;
      diffuse[o] *= ao; diffuse[o + 1] *= ao; diffuse[o + 2] *= ao;
    }
  }

  // Normal DX (Y−): n = (−dh/dx, −dh/dy, 1), y вниз по картинке
  prog("normal", 0.88);
  const s = (num(P.normalStrength, 1) * k) / 2;
  let hMin = 1e30, hMax = -1e30;
  for (let y = 0; y < N; y++) {
    const ym = (y === 0 ? N - 1 : y - 1) * N, yp = (y === N - 1 ? 0 : y + 1) * N, yo = y * N;
    for (let x = 0; x < N; x++) {
      const xm = x === 0 ? N - 1 : x - 1, xp = x === N - 1 ? 0 : x + 1;
      const gx = (h[yo + xp] - h[yo + xm]) * s, gy = (h[yp + x] - h[ym + x]) * s;
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1), o = (yo + x) * 4;
      normal[o] = (0.5 - 0.5 * gx * inv) * 255 + 0.5;
      normal[o + 1] = (0.5 - 0.5 * gy * inv) * 255 + 0.5;
      normal[o + 2] = (0.5 + 0.5 * inv) * 255 + 0.5;
      normal[o + 3] = 255;
      const hv = h[yo + x];
      if (hv < hMin) hMin = hv; if (hv > hMax) hMax = hv;
    }
  }

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
        for (const bIdx of [yo + xr, yd + x, yd + xr, yd + xl]) {
          const b = id[bIdx];
          if (b !== a && mat[b]) pairs.add(a < b ? a * nc + b : b * nc + a);
        }
      }
    }
    checks.push({
      level: pairs.size ? (P.colorMode === "mix" ? "info" : "warn") : "ok",
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
    },
  };
}

export const _internal = { noiseRows, rasterize, polyCentroid };
