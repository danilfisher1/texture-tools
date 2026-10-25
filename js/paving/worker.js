// Воркер генерации: превью (сырые RGBA + карта владельцев), экспорт (PNG 24 bit / 16 bit),
// миниатюры узоров (без текстур, нейтрально) и образцы материалов (с текстурами).
import { generate, thumbParams, litImage } from "./gen.js";
import { encodePNG } from "./png.js";
import { prepareTextures } from "./textures.js";

// уменьшение до sc и раскладка повтором (текстура периодична — края сходятся), как processPadImage на сайте:
// out(x) = уменьшенная((x + off) mod sw), off = sw + ⌊sw/2⌋ − ⌊N/2⌋. ERM: metallic (B) снова 0/255, emissive (R) 0
function shrinkTile(src, N, sc, ch, erm) {
  const sw = Math.max(1, Math.round(N * sc)), off = (sw + Math.floor(sw / 2) - Math.floor(N / 2)) % sw, k = N / sw;
  const out = new src.constructor(src.length), mx = new Int32Array(N), wx = new Float32Array(N), my = new Int32Array(N), wy = new Float32Array(N);
  for (let x = 0; x < N; x++) {
    const u = (((x + off) % sw) + 0.5) * k - 0.5, x0 = Math.floor(u);
    mx[x] = x0; wx[x] = u - x0; my[x] = x0; wy[x] = u - x0;
  }
  for (let y = 0; y < N; y++) {
    const y0 = (my[y] + N) % N, y1 = (y0 + 1) % N, fy = wy[y];
    for (let x = 0; x < N; x++) {
      const x0 = (mx[x] + N) % N, x1 = (x0 + 1) % N, fx = wx[x], o = (y * N + x) * ch;
      const a = (y0 * N + x0) * ch, b = (y0 * N + x1) * ch, c = (y1 * N + x0) * ch, d = (y1 * N + x1) * ch;
      for (let q = 0; q < ch; q++) {
        const top = src[a + q] + (src[b + q] - src[a + q]) * fx, bot = src[c + q] + (src[d + q] - src[c + q]) * fx;
        out[o + q] = Math.round(top + (bot - top) * fy);
      }
      if (erm) { out[o] = 0; out[o + 2] = out[o + 2] >= 128 ? 255 : 0; }
    }
  }
  return out;
}

self.onmessage = async (e) => {
  const { job, params, N, mode } = e.data;
  const progress = (stage, frac) => self.postMessage({ job, progress: true, stage, frac });
  try {
    if (mode === "thumb") {
      // миниатюра узора: рендер 2× и уменьшение до N, освещённый вид, нейтральные материалы
      const { preset, key } = e.data;
      const r = generate(thumbParams(preset, 0, N), N * 2, {});
      const img = litImage(r, N * 2, 2);
      self.postMessage({ job, ok: true, mode, key, name: preset.name, size: N, img }, [img.buffer]);
      return;
    }
    const tex = await prepareTextures(params, progress);
    if (mode === "swatch") {
      // образец материала / заполнения: рендер с запасом по краям (там шов на стыке), обрезка до центра
      const M = Math.round(N * 2.2), pad = Math.round((M - 2 * N) / 2);
      const r = generate(params, M, { tex });
      const lit = litImage(r, M, 1), out = new Uint8ClampedArray(N * N * 4);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const o = (y * N + x) * 4;
        for (let c = 0; c < 3; c++) {
          let v = 0;
          for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) v += lit[((pad + 2 * y + dy) * M + pad + 2 * x + dx) * 4 + c];
          out[o + c] = v / 4;
        }
        out[o + 3] = 255;
      }
      self.postMessage({ job, ok: true, mode, size: N, img: out }, [out.buffer]);
      return;
    }
    const r = generate(params, N, { tex, ids: mode === "preview", height16: mode === "export" && params.exportHeight, onProgress: progress });
    if (mode === "preview") {
      self.postMessage(
        { job, ok: true, mode, N, diffuse: r.diffuse, erm: r.erm, normal: r.normal, ids: r.ids, mat: r.mat, sig: r.sig, checks: r.checks, info: r.info },
        [r.diffuse.buffer, r.erm.buffer, r.normal.buffer, r.ids.buffer, r.mat.buffer]
      );
      return;
    }
    progress("PNG", 0.97);
    const jobs = { Diffuse: [r.diffuse, "rgb"], ERM: [r.erm, "rgb"], Normal: [r.normal, "rgb"] };
    if (r.height16) jobs.Height = [r.height16, "gray16"];
    if (params.export90) { // «90%»: как вкладка «90% края» — уменьшить, разложить повтором, взять центр N × N
      const sc = Math.min(0.99, Math.max(0.5, (+params.export90Pct || 90) / 100));
      for (const k in jobs) jobs[k][0] = shrinkTile(jobs[k][0], N, sc, jobs[k][1] === "gray16" ? 1 : 4, k === "ERM");
    }
    const files = {}, names = Object.keys(jobs);
    // все карты сжимаются одновременно (в Node на 4K это быстрее на треть, в Chrome — без разницы)
    const bytes = await Promise.all(names.map((k) => encodePNG(jobs[k][0], N, N, jobs[k][1])));
    names.forEach((k, i) => (files[k] = bytes[i]));
    self.postMessage({ job, ok: true, mode, N, files, sig: r.sig, checks: r.checks, info: r.info }, Object.values(files).map((f) => f.buffer));
  } catch (err) {
    self.postMessage({ job, ok: false, mode, error: String((err && err.message) || err) });
  }
};
