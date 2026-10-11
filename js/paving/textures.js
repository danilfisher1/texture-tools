// Загрузка CC0-текстур (WebP) в воркере: декод, цветокоррекция под материал, мип-уровни.
// Большие текстуры не входят в деплой Vercel (лимит 100 МБ) — на сайте грузятся из GitHub,
// локально — из папки textures/ рядом с сайтом.
import { MAT_BY_ID } from "./materials.js";
import { FILL_BY_ID } from "./joints.js";

export const TEX_REMOTE = "https://raw.githubusercontent.com/danilfisher1/texture-tools/main/textures/";
export function texBase() {
  const h = self.location.hostname;
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(h) ? new URL("../../textures/", import.meta.url).href : TEX_REMOTE;
}

const imgCache = new Map(); // url → Promise<{ w, h, data }>
function loadImage(url) {
  if (!imgCache.has(url)) {
    const p = (async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`текстура ${url.split("/").slice(-2).join("/")}: HTTP ${r.status}`);
      // GitHub raw отдаёт application/octet-stream — тип задаём явно
      const bmp = await createImageBitmap(new Blob([await r.arrayBuffer()], { type: "image/webp" }), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      const d = ctx.getImageData(0, 0, cv.width, cv.height);
      return { w: d.width, h: d.height, data: d.data };
    })();
    p.catch(() => imgCache.delete(url));
    imgCache.set(url, p);
  }
  return imgCache.get(url);
}

// мип-цепочка: усреднение 2×2 до 16 px (размеры — степени двойки)
export function buildMips(img) {
  const mips = [img];
  let cur = img;
  while (cur.w > 16 && cur.h > 16) {
    const w = cur.w >> 1, h = cur.h >> 1, s = cur.data, d = new Uint8ClampedArray(w * h * 4), W = cur.w;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = ((2 * y) * W + 2 * x) * 4, b = a + W * 4, o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) d[o + c] = (s[a + c] + s[a + 4 + c] + s[b + c] + s[b + 4 + c] + 2) >> 2;
    }
    cur = { w, h, data: d };
    mips.push(cur);
  }
  return mips;
}

function hex(h) {
  const v = parseInt(String(h).replace("#", ""), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

// цветокоррекция: duo (по яркости между тёмным и светлым) → тон → насыщенность → контраст → яркость → множитель
export function gradeImage(img, g) {
  if (!g) return img;
  const s = img.data, n = img.w * img.h, out = new Uint8ClampedArray(s.length);
  let lo = 0, hi = 1, mean = 0;
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) { const l = (0.299 * s[i * 4] + 0.587 * s[i * 4 + 1] + 0.114 * s[i * 4 + 2]) / 255; L[i] = l; mean += l; }
  mean /= n;
  if (g.duo) { const srt = Float32Array.from(L).sort(); lo = srt[Math.floor(n * 0.02)]; hi = srt[Math.floor(n * 0.98)] || 1; }
  const dA = g.duo ? hex(g.duo[0]) : null, dB = g.duo ? hex(g.duo[1]) : null;
  const hr = ((g.h || 0) * Math.PI) / 180, ch = Math.cos(hr), sh = Math.sin(hr);
  const sat = g.s == null ? 1 : g.s, con = g.c == null ? 1 : g.c, bri = g.b == null ? 1 : g.b, t = g.t || [1, 1, 1];
  for (let i = 0; i < n; i++) {
    let r = s[i * 4] / 255, gg = s[i * 4 + 1] / 255, b = s[i * 4 + 2] / 255;
    if (dA) { const k = Math.min(1, Math.max(0, (L[i] - lo) / Math.max(1e-3, hi - lo))); r = dA[0] + (dB[0] - dA[0]) * k; gg = dA[1] + (dB[1] - dA[1]) * k; b = dA[2] + (dB[2] - dA[2]) * k; }
    if (hr) { // поворот тона в YIQ
      const y = 0.299 * r + 0.587 * gg + 0.114 * b, ii = 0.596 * r - 0.274 * gg - 0.322 * b, q = 0.211 * r - 0.523 * gg + 0.312 * b;
      const i2 = ii * ch - q * sh, q2 = ii * sh + q * ch;
      r = y + 0.956 * i2 + 0.621 * q2; gg = y - 0.272 * i2 - 0.647 * q2; b = y - 1.106 * i2 + 1.703 * q2;
    }
    const y = 0.299 * r + 0.587 * gg + 0.114 * b;
    r = y + (r - y) * sat; gg = y + (gg - y) * sat; b = y + (b - y) * sat;
    const m = dA ? 0.5 : mean;
    r = ((r - m) * con + m) * bri * t[0]; gg = ((gg - m) * con + m) * bri * t[1]; b = ((b - m) * con + m) * bri * t[2];
    out[i * 4] = r * 255; out[i * 4 + 1] = gg * 255; out[i * 4 + 2] = b * 255; out[i * 4 + 3] = 255;
  }
  return { w: img.w, h: img.h, data: out };
}

function meanOf(img) {
  const s = img.data, n = img.w * img.h;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < n * 4; i += 4) { r += s[i]; g += s[i + 1]; b += s[i + 2]; }
  r /= n; g /= n; b /= n;
  return { rgb: [r, g, b], lum: (0.299 * r + 0.587 * g + 0.114 * b) / 255 };
}

const setCache = new Map(); // asset → Promise<{ normal, rough, disp }> (мипы), общие для всех коррекций
const colorCache = new Map(); // asset|коррекция → Promise<{ color mips, mean }>
function loadSet(asset) {
  if (!setCache.has(asset)) {
    const base = texBase() + asset + "/";
    const p = Promise.all(["normal", "rough", "disp"].map((k) => loadImage(base + k + ".webp"))).then(([n, r, d]) => ({ normal: buildMips(n), rough: buildMips(r), disp: buildMips(d) }));
    p.catch(() => setCache.delete(asset));
    setCache.set(asset, p);
  }
  return setCache.get(asset);
}
function loadColor(asset, g) {
  const key = asset + "|" + JSON.stringify(g || {});
  if (!colorCache.has(key)) {
    const p = loadImage(texBase() + asset + "/color.webp").then((img) => {
      const gr = gradeImage(img, g);
      return { color: buildMips(gr), mean: meanOf(gr) };
    });
    p.catch(() => colorCache.delete(key));
    colorCache.set(key, p);
  }
  return colorCache.get(key);
}

// подготовка текстур для набора параметров: по слоту материала и для заполнения шва
export async function prepareTextures(P, onProgress) {
  const out = { mats: [], fill: null };
  const jobs = [];
  (P.materials || []).forEach((sm, i) => {
    const lib = sm && sm.lib ? MAT_BY_ID[sm.lib] : null;
    if (!lib || !lib.tex) { out.mats[i] = null; return; }
    jobs.push(Promise.all([loadColor(lib.tex, lib.g), loadSet(lib.tex)]).then(([c, s]) => { out.mats[i] = Object.assign({ asset: lib.tex }, c, s); }));
  });
  const fill = FILL_BY_ID[P.jointFill];
  if (fill && fill.tex) jobs.push(Promise.all([loadColor(fill.tex, null), loadSet(fill.tex)]).then(([c, s]) => { out.fill = Object.assign({ asset: fill.tex }, c, s); }));
  if (jobs.length && onProgress) onProgress("загрузка текстур", 0.01);
  await Promise.all(jobs);
  return out;
}
