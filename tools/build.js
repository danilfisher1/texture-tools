// Сборка библиотеки: исходные JPG ambientCG (2K) → WebP в textures/ (color, normal 2K; rough, disp 1K)
// и миниатюры img/mat/<id>.webp, img/fill/<id>.webp, отрисованные тем же генератором.
import { DEFAULTS } from "../js/paving/gen.js";
import { MATERIALS, textureAssets } from "../js/paving/materials.js";
import { JOINT_FILLS } from "../js/paving/joints.js";

const logEl = document.getElementById("log"), grid = document.getElementById("grid");
const log = (s) => { logEl.textContent += s + "\n"; logEl.scrollTop = 1e9; };
const force = () => document.getElementById("force").checked;
async function exists(url) { try { return (await fetch(url, { method: "HEAD", cache: "no-store" })).ok; } catch (e) { return false; } }
async function put(path, blob) {
  const r = await fetch("/__save/" + path, { method: "PUT", body: blob });
  if (!r.ok) throw new Error("save " + path + ": " + r.status);
}
async function toWebp(url, size, q) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ": " + r.status);
  const bmp = await createImageBitmap(await r.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const cv = new OffscreenCanvas(size, size), ctx = cv.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, size, size);
  return cv.convertToBlob({ type: "image/webp", quality: q });
}

document.getElementById("conv").onclick = async () => {
  const assets = textureAssets(JOINT_FILLS);
  log(`наборов: ${assets.length}`);
  let total = 0;
  for (const a of assets) {
    for (const [map, size, q] of [["color", 2048, 0.84], ["normal", 2048, 0.9], ["rough", 1024, 0.8], ["disp", 1024, 0.85]]) {
      const dst = `textures/${a}/${map}.webp`;
      if (!force() && (await exists("/" + dst))) continue;
      try {
        const b = await toWebp(`/__src/${a}/${map}.jpg`, size, q);
        await put(dst, b);
        total += b.size;
        log(`${dst}  ${(b.size / 1024).toFixed(0)} КБ`);
      } catch (e) { log("ОШИБКА " + e.message); }
    }
  }
  log(`готово, записано ${(total / 1048576).toFixed(1)} МБ`);
};

function render(params, N) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL("../js/paving/worker.js", import.meta.url), { type: "module" });
    w.onmessage = (e) => { if (e.data.progress) return; w.terminate(); e.data.ok ? resolve(e.data) : reject(new Error(e.data.error)); };
    w.postMessage({ job: 1, mode: "swatch", params, N });
  });
}
async function saveThumb(path, m, title) {
  const cv = new OffscreenCanvas(m.size, m.size);
  cv.getContext("2d").putImageData(new ImageData(m.img, m.size, m.size), 0, 0);
  const b = await cv.convertToBlob({ type: "image/webp", quality: 0.86 });
  await put(path, b);
  const url = URL.createObjectURL(b);
  grid.insertAdjacentHTML("beforeend", `<div><img src="${url}">${title}</div>`);
}
const THUMB = 160;

export function materialSwatchParams(mat) {
  const plane = Math.min(1000, Math.max(400, mat.scale * 0.6));
  return Object.assign({}, DEFAULTS, { size: plane, layout: "stack", ex: plane, ey: plane, joint: 0, countX: 1, countY: 1, chamfer: 0, tilt: 0, lift: 0, ao: 40, seed: 3, materials: [{ lib: mat.id }], colorMode: "single" });
}
export function fillSwatchParams(f) {
  return Object.assign({}, DEFAULTS, {
    size: 240, layout: "stack", ex: 40, ey: 40, joint: 20, countX: 4, countY: 4, chamfer: 1, tilt: 0, lift: 0, ao: 60, seed: 3,
    materials: [{ color: "#a9a8a3", vary: 3, rough: 0.8 }], colorMode: "single",
    jointFill: f.id, jointColor: f.colors[0][1], jointProfile: f.profile, jointDepth: 3, jointRough: f.r,
  });
}

document.getElementById("mat").onclick = async () => {
  for (const mat of MATERIALS) {
    const dst = `img/mat/${mat.id}.webp`;
    if (!force() && (await exists("/" + dst))) continue;
    try { await saveThumb(dst, await render(materialSwatchParams(mat), THUMB), mat.name); log(dst); }
    catch (e) { log("ОШИБКА " + mat.id + ": " + e.message); }
  }
  log("миниатюры материалов готовы");
};
document.getElementById("fill").onclick = async () => {
  for (const f of JOINT_FILLS) {
    const dst = `img/fill/${f.id}.webp`;
    if (!force() && (await exists("/" + dst))) continue;
    try { await saveThumb(dst, await render(fillSwatchParams(f), THUMB), f.name); log(dst); }
    catch (e) { log("ОШИБКА " + f.id + ": " + e.message); }
  }
  log("миниатюры заполнений готовы");
};
