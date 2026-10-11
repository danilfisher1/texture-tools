// Воркер генерации: превью (сырые RGBA + карта владельцев) или экспорт (PNG 24 bit / 16 bit).
import { generate } from "./gen.js";
import { encodePNG } from "./png.js";

self.onmessage = async (e) => {
  const { job, params, N, mode } = e.data;
  const progress = (stage, frac) => self.postMessage({ job, progress: true, stage, frac });
  try {
    const r = generate(params, N, { ids: mode === "preview", height16: mode === "export" && params.exportHeight, onProgress: progress });
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
    const files = {}, names = Object.keys(jobs);
    // сжатие идёт параллельно — так на 4K примерно на треть быстрее
    const bytes = await Promise.all(names.map((k) => encodePNG(jobs[k][0], N, N, jobs[k][1])));
    names.forEach((k, i) => (files[k] = bytes[i]));
    self.postMessage({ job, ok: true, mode, N, files, sig: r.sig, checks: r.checks, info: r.info }, Object.values(files).map((f) => f.buffer));
  } catch (err) {
    self.postMessage({ job, ok: false, error: String((err && err.message) || err) });
  }
};
