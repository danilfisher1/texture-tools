// Тесты генератора мощения: node tests/paving.test.mjs
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { generate, buildLayout, parseRules, ruleMat, rng, DEFAULTS, _internal } from "../js/paving/gen.js";
import { encodePNG } from "../js/paving/png.js";

const P0 = (o) => Object.assign({}, DEFAULTS, o);
let fails = 0;
function test(name, fn) {
  try { fn(); console.log("ok  ", name); } catch (e) { fails++; console.log("FAIL", name, "\n   ", e.message); }
}

// 1. шум: σ ≈ 1 и периодичен (строка 0 и строка N продолжают друг друга)
test("noise σ≈1", () => {
  for (const [cell, oct] of [[37, 1], [30, 3], [1.2, 1]]) {
    const N = 512, row = _internal.noiseRows(4000, N, cell, oct, 9);
    let s = 0, s2 = 0;
    for (let y = 0; y < N; y += 3) { const r = row(y); for (let x = 0; x < N; x++) { s += r[x]; s2 += r[x] * r[x]; } }
    const M = N * Math.ceil(N / 3), sd = Math.sqrt(s2 / M - (s / M) ** 2);
    console.log("      ячейка " + cell + " мм, октав " + oct + ": σ " + sd.toFixed(3));
    assert.ok(sd > 0.6 && sd < 1.3);
  }
});

// 2. раскладки: площадь = S², каждый пиксель ровно в одной ячейке
function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i] * p[j + 1] - p[j] * p[i + 1]; }
  return Math.abs(a) / 2;
}
function coverage(cells, N, S) {
  const cnt = new Uint8Array(N * N), k = N / S;
  for (const c of cells) {
    const p = c.poly, nv = p.length / 2;
    let mx = 0, my = 0;
    for (let v = 0; v < nv; v++) { mx += p[2 * v]; my += p[2 * v + 1]; }
    mx /= nv; my /= nv;
    const E = [];
    for (let v = 0; v < nv; v++) {
      const v2 = (v + 1) % nv, x1 = p[2 * v], y1 = p[2 * v + 1], x2 = p[2 * v2], y2 = p[2 * v2 + 1];
      let nx = -(y2 - y1), ny = x2 - x1;
      const l = Math.hypot(nx, ny);
      if (l < 1e-9) continue;
      nx /= l; ny /= l;
      if (nx * (mx - x1) + ny * (my - y1) < 0) { nx = -nx; ny = -ny; }
      E.push([nx, ny, -(nx * x1 + ny * y1)]);
    }
    const xs = p.filter((_, i) => !(i & 1)), ys = p.filter((_, i) => i & 1);
    for (let py = Math.floor(Math.min(...ys) * k) - 1; py <= Math.ceil(Math.max(...ys) * k); py++)
      for (let px = Math.floor(Math.min(...xs) * k) - 1; px <= Math.ceil(Math.max(...xs) * k); px++) {
        const x = (px + 0.5137) / k, y = (py + 0.4871) / k; // сдвиг: центры не ложатся точно на рёбра
        if (E.every(([a, b, cc]) => a * x + b * y + cc > 1e-7)) cnt[(((py % N) + N) % N) * N + (((px % N) + N) % N)]++;
      }
  }
  let max = 0, zero = 0;
  for (const v of cnt) { if (v > max) max = v; if (!v) zero++; }
  return { max, zero };
}
const LAY = [
  ["stack", { layout: "stack", ex: 100, ey: 100 }],
  ["running 1/2", { layout: "running", ex: 100, ey: 300, offset: "1/2" }],
  ["running 1/3", { layout: "running", ex: 200, ey: 100, offset: "1/3" }],
  ["running rand+jitter", { layout: "running", ex: 100, ey: 100, offset: "rand", jitter: 14, joint: 8 }],
  ["herring90 2:1", { layout: "herring90", ex: 200, ey: 100 }],
  ["herring90 3:1", { layout: "herring90", ex: 300, ey: 100 }],
  ["herring45 2:1", { layout: "herring45", ex: 200, ey: 100 }],
  ["basket 2:1", { layout: "basket", ex: 200, ey: 100 }],
  ["hex", { layout: "hex", ex: 200 }],
  ["voronoi", { layout: "voronoi", ex: 400, jitter: 90, relax: 1, joint: 12 }],
  ["rotate", { layout: "running", ex: 100, ey: 300, rotate: true }],
];
for (const [name, o] of LAY) test("раскладка " + name, () => {
  const P = P0(o), lay = buildLayout(P, 1, rng(5));
  const area = lay.cells.reduce((s, c) => s + polyArea(c.poly), 0);
  assert.ok(Math.abs(area / (P.size * P.size) - 1) < 1e-6, "площадь " + area / (P.size * P.size));
  const cv = coverage(lay.cells, 397, P.size); // 397 — чтобы центры пикселей не ложились точно на рёбра
  assert.equal(cv.max, 1, "наложение ячеек");
  assert.ok(cv.zero < 397 * 397 * 0.002, "дыр " + cv.zero); // пиксели точно на границе
  console.log("      " + lay.countText + " · " + lay.elemText);
});

// 3. правило «Профи 4–1 / 4–2–3» = make_tile1_v2.py
test("правило вставок = make_tile1_v2.py", () => {
  const P = P0({ layout: "running", ex: 100, ey: 300, joint: 3, countX: 40, countY: 16, colorMode: "rules" });
  const rules = parseRules(P.rules, 2);
  assert.ok(rules.ok, rules.error);
  const lay = buildLayout(P, 4, rng(1));
  assert.equal(lay.rows, 16);
  assert.equal(lay.cols, 40);
  const A = new Set([4, 6]), B = new Set([4, 7, 11]);
  let k = 0, kb = 0;
  for (let r = 0; r < 16; r++) {
    for (let i = 0; i < 40; i++) {
      const exp = r % 4 === 0 ? A.has((i + k) % 7) : r % 4 === 2 ? B.has((i + kb) % 12) : false;
      assert.equal(ruleMat(rules, r, i) === 1, exp, `ряд ${r} плитка ${i}`);
    }
    if (r % 4 === 0) k++;
    if (r % 4 === 2) kb++;
  }
});
test("правило: ошибки разбора", () => {
  assert.equal(parseRules("4 x", 2).ok, false);
  assert.equal(parseRules("4 1 *3", 2).ok, false);
  assert.equal(parseRules(":1212\n=2", 2).ok, true);
});

// 4. полная генерация, проверки
test("generate: Тип 1, проверки", () => {
  const P = P0({ layout: "running", ex: 100, ey: 300, countX: 40, countY: 16, colorMode: "rules" });
  const r = generate(P, 512, { ids: true });
  for (const c of r.checks) console.log("      " + c.level.padEnd(4) + " " + c.text);
  assert.ok(!r.checks.some((c) => c.level === "err"));
  assert.ok(r.checks.some((c) => /не соприкасаются/.test(c.text)));
});
for (const [name, o] of LAY) test("generate 512: " + name, () => {
  const r = generate(P0(Object.assign({ irregular: 2, corner: 3, chip: 1, relief: 1, speck: 40 }, o)), 512, {});
  const bad = r.checks.filter((c) => c.level === "err");
  assert.equal(bad.length, 0, bad.map((c) => c.text).join("; "));
  console.log("      " + r.info.ms + " мс");
});
test("стык карт не отличается от середины", () => {
  const N = 512, r = generate(P0({ layout: "herring45", ex: 200, ey: 100, relief: 1 }), N, {});
  let dEdge = 0, dMid = 0;
  for (let y = 0; y < N; y++) for (let c = 0; c < 3; c++) {
    dEdge += Math.abs(r.normal[(y * N + N - 1) * 4 + c] - r.normal[y * N * 4 + c]);
    dMid += Math.abs(r.normal[(y * N + N / 2 - 1) * 4 + c] - r.normal[(y * N + N / 2) * 4 + c]);
  }
  console.log("      стык " + (dEdge / N).toFixed(1) + " середина " + (dMid / N).toFixed(1));
  assert.ok(dEdge < dMid * 1.6 + 20);
});

// 5. PNG: кодируем и декодируем обратно
function decodePNG(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset);
  let o = 8, w = 0, h = 0, depth = 0, ct = 0;
  const idat = [];
  while (o < buf.length) {
    const len = dv.getUint32(o), type = String.fromCharCode(...buf.subarray(o + 4, o + 8));
    if (type === "IHDR") { w = dv.getUint32(o + 8); h = dv.getUint32(o + 12); depth = buf[o + 16]; ct = buf[o + 17]; }
    if (type === "IDAT") idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat)), bpp = ct === 2 ? 3 : 2, stride = w * bpp;
  const out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= bpp ? out[y * stride + i - bpp] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = i >= bpp && y ? out[(y - 1) * stride + i - bpp] : 0;
      let p = 0;
      if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + i] = (x + p) & 255;
    }
  }
  return { w, h, depth, ct, out };
}
try {
  const N = 64, rgba = new Uint8ClampedArray(N * N * 4), g16 = new Uint16Array(N * N);
  for (let i = 0; i < N * N; i++) { rgba[i * 4] = i & 255; rgba[i * 4 + 1] = (i * 7) & 255; rgba[i * 4 + 2] = (i * 13) & 255; rgba[i * 4 + 3] = 255; g16[i] = (i * 977) & 65535; }
  const p1 = decodePNG(await encodePNG(rgba, N, N, "rgb")), p2 = decodePNG(await encodePNG(g16, N, N, "gray16"));
  assert.equal(p1.ct, 2); assert.equal(p1.depth, 8); assert.equal(p2.depth, 16);
  for (let i = 0; i < N * N; i++) {
    assert.equal(p1.out[i * 3], rgba[i * 4]);
    assert.equal(p1.out[i * 3 + 2], rgba[i * 4 + 2]);
    assert.equal((p2.out[i * 2] << 8) | p2.out[i * 2 + 1], g16[i]);
  }
  console.log("ok   PNG 24 bit RGB и 16 bit gray декодируются обратно");
} catch (e) { fails++; console.log("FAIL PNG", e.message); }

console.log(fails ? `\n${fails} FAIL` : "\nвсе тесты прошли");
process.exit(fails ? 1 : 0);
