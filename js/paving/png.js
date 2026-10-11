// PNG-кодер: 24 bit RGB (из RGBA) и 16 bit grayscale. Фильтр Paeth, сжатие — CompressionStream("deflate") (zlib).

let CRC_T = null;
function crc32(buf, crc) {
  if (!CRC_T) {
    CRC_T = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_T[n] = c >>> 0;
    }
  }
  crc = crc === undefined ? 0xffffffff : crc;
  for (let i = 0; i < buf.length; i++) crc = CRC_T[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return crc;
}

function chunk(type, data) {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, (crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0);
  return out;
}

async function zlib(data) {
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  w.write(data);
  w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

// kind: "rgb" — src RGBA Uint8 (альфа отбрасывается); "gray16" — src Uint16Array
export async function encodePNG(src, w, h, kind) {
  const bpp = kind === "gray16" ? 2 : 3;
  const stride = w * bpp;
  const raw = new Uint8Array((stride + 1) * h);
  let prev = new Uint8Array(stride), cur = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    if (kind === "gray16") {
      for (let x = 0; x < w; x++) { const v = src[y * w + x]; cur[2 * x] = v >> 8; cur[2 * x + 1] = v & 255; }
    } else {
      for (let x = 0, s = y * w * 4; x < w; x++, s += 4) { cur[3 * x] = src[s]; cur[3 * x + 1] = src[s + 1]; cur[3 * x + 2] = src[s + 2]; }
    }
    const o = y * (stride + 1);
    raw[o] = 4; // Paeth
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      raw[o + 1 + i] = cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
    }
    const t = prev; prev = cur; cur = t;
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = kind === "gray16" ? 16 : 8;
  ihdr[9] = kind === "gray16" ? 0 : 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", await zlib(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
