
window.__switchTab = function (name) {
  try {
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.getAttribute("data-tab") === name);
    });
    document.querySelectorAll(".panel").forEach(function (p) {
      var on = p.id === ("panel-" + name);
      p.classList.toggle("active", on);
      p.style.display = on ? "flex" : "none";
    });
  } catch (err) {
    console.error(err);
  }
};
(function () {
  "use strict";

  var ALLOWED_SIZES = [256, 2048, 4096];

  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      window.__switchTab(btn.getAttribute("data-tab"));
    });
  });
  window.__switchTab("pad");

  function setStatus(msg) { document.getElementById("status").textContent = msg; }

  function isPngFile(file) {
    var n = (file.name || "").toLowerCase();
    return file.type === "image/png" || n.endsWith(".png");
  }

  function filterPngFiles(fileList) {
    var ok = [], bad = 0;
    for (var i = 0; i < fileList.length; i++) {
      if (isPngFile(fileList[i])) ok.push(fileList[i]);
      else bad++;
    }
    if (bad) alert("Пропущено не-PNG файлов: " + bad + "\nРазрешены только .png");
    return ok;
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      if (!isPngFile(file)) { reject(new Error("Только PNG: " + file.name)); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Ошибка: " + file.name)); };
      img.src = url;
    });
  }

  function analyzeImage(img) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var c = document.createElement("canvas");
    c.width = w; c.height = h;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    var data = ctx.getImageData(0, 0, w, h).data;
    var hasAlpha = false;
    var colors = {};
    var colorCount = 0;
    var sample = (w * h > 262144) ? 4 : 1; // subsample huge
    for (var i = 0; i < data.length; i += 4 * sample) {
      if (data[i + 3] < 255) hasAlpha = true;
      if (w === 256 && h === 256) {
        var key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        if (!colors[key]) { colors[key] = 1; colorCount++; }
      }
    }
    // full color count for 256 if subsampled
    if (w === 256 && h === 256 && sample > 1) {
      colors = {}; colorCount = 0;
      for (var j = 0; j < data.length; j += 4) {
        var k2 = (data[j] << 16) | (data[j + 1] << 8) | data[j + 2];
        if (!colors[k2]) { colors[k2] = 1; colorCount++; }
      }
    }
    var sizeOk = (w === h && ALLOWED_SIZES.indexOf(w) !== -1);
    return {
      w: w, h: h, hasAlpha: hasAlpha, bits: hasAlpha ? 32 : 24,
      colorCount: (w === 256 && h === 256) ? colorCount : null,
      sizeOk: sizeOk,
      stubBad: (w === 256 && h === 256 && colorCount > 1)
    };
  }

  function sizeLabel(w, h) {
    return w + "×" + h;
  }

  function sizeWarnText(info) {
    if (!info.sizeOk) return "размер не по требованиям (нужен 256 / 2048 / 4096 квадрат)";
    if (info.stubBad) return "заглушка 256×256 содержит больше 1 цвета (" + info.colorCount + ")";
    return "";
  }

  // ── RGB PNG 24-bit encoder (no alpha) ──
  function crc32(buf) {
    var table = crc32.table;
    if (!table) {
      table = crc32.table = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function writeChunk(type, data) {
    var len = data.length;
    var out = new Uint8Array(12 + len);
    var dv = new DataView(out.buffer);
    dv.setUint32(0, len);
    out[4] = type.charCodeAt(0); out[5] = type.charCodeAt(1);
    out[6] = type.charCodeAt(2); out[7] = type.charCodeAt(3);
    out.set(data, 8);
    var crcBuf = out.subarray(4, 8 + len);
    dv.setUint32(8 + len, crc32(crcBuf));
    return out;
  }

  async function deflateRaw(data) {
    if (typeof CompressionStream !== "undefined") {
      var cs = new CompressionStream("deflate");
      var writer = cs.writable.getWriter();
      writer.write(data);
      writer.close();
      var ab = await new Response(cs.readable).arrayBuffer();
      return new Uint8Array(ab);
    }
    // fallback: uncompressed deflate blocks
    var out = [];
    var pos = 0;
    while (pos < data.length) {
      var chunk = Math.min(65535, data.length - pos);
      var last = (pos + chunk >= data.length) ? 1 : 0;
      out.push(last, chunk & 0xff, (chunk >> 8) & 0xff, (~chunk) & 0xff, ((~chunk) >> 8) & 0xff);
      for (var i = 0; i < chunk; i++) out.push(data[pos + i]);
      pos += chunk;
    }
    return new Uint8Array(out);
  }

  async function encodePngRGB(canvas) {
    var w = canvas.width, h = canvas.height;
    var ctx = canvas.getContext("2d");
    var img = ctx.getImageData(0, 0, w, h);
    var rgba = img.data;
    // filter 0 scanlines: 1 + w*3 per row
    var raw = new Uint8Array((w * 3 + 1) * h);
    for (var y = 0; y < h; y++) {
      var row = y * (w * 3 + 1);
      raw[row] = 0;
      for (var x = 0; x < w; x++) {
        var si = (y * w + x) * 4;
        var di = row + 1 + x * 3;
        raw[di] = rgba[si];
        raw[di + 1] = rgba[si + 1];
        raw[di + 2] = rgba[si + 2];
      }
    }
    var compressed = await deflateRaw(raw);
    var sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    var ihdr = new Uint8Array(13);
    var dv = new DataView(ihdr.buffer);
    dv.setUint32(0, w); dv.setUint32(4, h);
    ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    var parts = [sig, writeChunk("IHDR", ihdr), writeChunk("IDAT", compressed), writeChunk("IEND", new Uint8Array(0))];
    var total = 0;
    parts.forEach(function (p) { total += p.length; });
    var out = new Uint8Array(total);
    var o = 0;
    parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return new Blob([out], { type: "image/png" });
  }

  async function encodePngRGBA(canvas) {
    // keep alpha — use browser encoder
    return new Promise(function (res) { canvas.toBlob(res, "image/png"); });
  }

  async function canvasToPngBlob(canvas, bits) {
    if (bits === 32) return encodePngRGBA(canvas);
    return encodePngRGB(canvas);
  }

  function resizeCanvas(srcCanvas, size) {
    var out = document.createElement("canvas");
    out.width = size; out.height = size;
    var ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(srcCanvas, 0, 0, size, size);
    return out;
  }

  function imgToCanvas(img) {
    var c = document.createElement("canvas");
    c.width = img.naturalWidth || img.width;
    c.height = img.naturalHeight || img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    return c;
  }

  function syncRangeNum(rangeId, numId, onChange) {
    var r = document.getElementById(rangeId);
    var n = document.getElementById(numId);
    if (!r || !n) return;
    r.addEventListener("input", function () { n.value = r.value; if (onChange) onChange(); });
    n.addEventListener("input", function () {
      var v = parseFloat(n.value);
      if (isNaN(v)) return;
      r.value = v;
      if (onChange) onChange();
    });
  }

  function drawThumb(canvas, src, maxSize) {
    maxSize = maxSize || 900;
    var w = src.width || src.naturalWidth;
    var h = src.height || src.naturalHeight;
    var s = Math.min(1, maxSize / Math.max(w, h));
    var dw = Math.max(1, Math.round(w * s));
    var dh = Math.max(1, Math.round(h * s));
    canvas.width = dw; canvas.height = dh;
    canvas.getContext("2d").drawImage(src, 0, 0, dw, dh);
  }

  function openFullscreen(src, caption) {
    var ov = document.getElementById("fs-overlay");
    var cv = document.getElementById("fs-canvas");
    var w = src.width || src.naturalWidth;
    var h = src.height || src.naturalHeight;
    cv.width = w; cv.height = h;
    cv.getContext("2d").drawImage(src, 0, 0);
    document.getElementById("fs-caption").textContent = caption || "";
    ov.classList.add("open");
  }
  function closeFullscreen() { document.getElementById("fs-overlay").classList.remove("open"); }
  document.getElementById("fs-close").addEventListener("click", function (e) { e.stopPropagation(); closeFullscreen(); });
  document.getElementById("fs-overlay").addEventListener("click", function (e) {
    if (e.target.id === "fs-overlay" || e.target.id === "fs-canvas") closeFullscreen();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeFullscreen(); });

  function metaHtml(info) {
    var s = sizeLabel(info.w, info.h) + " · " + info.bits + " bit";
    if (info.colorCount !== null) s += " · цветов: " + info.colorCount;
    var cls = [];
    if (!info.sizeOk || info.stubBad) cls.push("warn-size");
    if (info.hasAlpha) cls.push("warn-bit");
    var warn = sizeWarnText(info);
    var html = '<span class="' + cls.join(" ") + '">' + s + "</span>";
    if (warn) html += '<div class="meta warn-size">' + warn + "</div>";
    if (info.hasAlpha) html += '<div class="meta" style="color:#cc8">32 bit — есть прозрачность</div>';
    return html;
  }

  // ══════════ 90% ══════════
  var padItems = [];

  function processPadImage(img, scale) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var sw = Math.max(1, Math.round(w * scale));
    var sh = Math.max(1, Math.round(h * scale));
    var sc = document.createElement("canvas");
    sc.width = sw; sc.height = sh;
    var sctx = sc.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(img, 0, 0, sw, sh);
    var big = document.createElement("canvas");
    big.width = sw * 3; big.height = sh * 3;
    var bctx = big.getContext("2d");
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) bctx.drawImage(sc, i * sw, j * sh);
    var left = sw + Math.floor(sw / 2) - Math.floor(w / 2);
    var top = sh + Math.floor(sh / 2) - Math.floor(h / 2);
    var out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(big, left, top, w, h, 0, 0, w, h);
    return out;
  }

  function renderPadList() {
    var list = document.getElementById("pad-list");
    list.innerHTML = "";
    padItems.forEach(function (it, i) {
      var d = document.createElement("div");
      var cls = "file-item";
      if (!it.info.sizeOk || it.info.stubBad) cls += " warn-size";
      if (it.info.hasAlpha) cls += " warn-bit";
      d.className = cls;
      d.innerHTML = it.name + '<div class="meta">' + metaHtml(it.info) + "</div>" +
        '<div class="row"><label><input type="checkbox" data-i="' + i + '" class="pad-resz"' +
        (it.resizeOn ? " checked" : "") + "> Изменить размер</label>" +
        '<select data-i="' + i + '" class="sel pad-rsz-sel"' + (it.resizeOn ? "" : " disabled") + ">" +
        '<option value="256"' + (it.resizeTo === 256 ? " selected" : "") + ">256×256</option>" +
        '<option value="2048"' + (it.resizeTo === 2048 ? " selected" : "") + ">2048×2048</option>" +
        '<option value="4096"' + (it.resizeTo === 4096 ? " selected" : "") + ">4096×4096</option></select></div>";
      list.appendChild(d);
    });
    list.querySelectorAll(".pad-resz").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var i = +cb.getAttribute("data-i");
        padItems[i].resizeOn = cb.checked;
        renderPadList();
      });
    });
    list.querySelectorAll(".pad-rsz-sel").forEach(function (sel) {
      sel.addEventListener("change", function () {
        padItems[+sel.getAttribute("data-i")].resizeTo = +sel.value;
      });
    });
  }

  document.getElementById("pad-files").addEventListener("change", async function (e) {
    var files = filterPngFiles(e.target.files);
    padItems = [];
    for (var i = 0; i < files.length; i++) {
      try {
        var img = await loadImageFromFile(files[i]);
        var info = analyzeImage(img);
        padItems.push({ file: files[i], img: img, name: files[i].name, info: info, resizeOn: false, resizeTo: 2048 });
      } catch (err) { console.error(err); }
    }
    renderPadList();
    setStatus("90%: " + padItems.length + " PNG");
  });

  document.getElementById("pad-run").addEventListener("click", async function () {
    if (!padItems.length) { alert("Выберите PNG"); return; }
    var scale = parseFloat(document.getElementById("pad-scale").value) || 0.9;
    var logEl = document.getElementById("pad-log");
    logEl.textContent = "";
    setStatus("Обработка...");
    var zip = new JSZip();
    var folder = zip.folder("90");
    for (var i = 0; i < padItems.length; i++) {
      var it = padItems[i];
      logEl.textContent += (i + 1) + "/" + padItems.length + " " + it.name + "\n";
      var canvas = processPadImage(it.img, scale);
      if (it.resizeOn) canvas = resizeCanvas(canvas, it.resizeTo);
      var blob = await canvasToPngBlob(canvas, 24);
      folder.file(it.name, blob);
    }
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "textures_90.zip";
    a.click();
    setStatus("Готов — ZIP 24 bit");
  });

  // ══════════ NORMAL ══════════
  var normItems = [];
  var normSelected = -1;
  var normGenTimer = null;

  function defaultNormParams() {
    return { bias: 50, invR: false, invG: false, blurOn: false, blur: 0 };
  }
  function getGlobalNormParams() {
    return {
      bias: parseFloat(document.getElementById("norm-bias-num").value) || 50,
      invR: document.getElementById("norm-inv-r").checked,
      invG: document.getElementById("norm-inv-g").checked,
      blurOn: document.getElementById("norm-blur-on").checked,
      blur: parseFloat(document.getElementById("norm-blur-num").value) || 0
    };
  }
  function setUIFromParams(p) {
    document.getElementById("norm-bias").value = p.bias;
    document.getElementById("norm-bias-num").value = p.bias;
    document.getElementById("norm-inv-r").checked = p.invR;
    document.getElementById("norm-inv-g").checked = p.invG;
    document.getElementById("norm-blur-on").checked = p.blurOn;
    document.getElementById("norm-blur").value = p.blur;
    document.getElementById("norm-blur-num").value = p.blur;
  }
  function normalOutName(srcName) {
    var base = srcName.replace(/\.[^.]+$/, "");
    var lower = base.toLowerCase();
    var idx = lower.indexOf("diffuse");
    var newBase = idx !== -1 ? base.substring(0, idx) + "Normal" + base.substring(idx + 7) : base + "_Normal";
    return newBase + ".png";
  }

  function generateNormalMap(img, bias, invertR, invertG, blurAmt) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var srcCanvas = document.createElement("canvas");
    srcCanvas.width = w; srcCanvas.height = h;
    var sctx = srcCanvas.getContext("2d");
    if (blurAmt > 0.1) sctx.filter = "blur(" + (blurAmt * 0.4) + "px)";
    sctx.drawImage(img, 0, 0);
    sctx.filter = "none";
    var px = sctx.getImageData(0, 0, w, h).data;
    var height = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) height[i] = px[i * 4] / 255;
    var invR = invertR ? -1 : 1, invG = invertG ? -1 : 1;
    var z = Math.max(1 - ((bias - 0.1) / 100), 0.01);
    var out = document.createElement("canvas");
    out.width = w; out.height = h;
    var octx = out.getContext("2d");
    var od = octx.createImageData(w, h);
    var op = od.data;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;
        var d0 = height[idx];
        var d1 = height[y * w + Math.min(x + 1, w - 1)];
        var d2 = height[y * w + Math.max(x - 1, 0)];
        var d3 = height[Math.min(y + 1, h - 1) * w + x];
        var d4 = height[Math.max(y - 1, 0) * w + x];
        var dx = ((d2 - d0) + (d0 - d1)) * 0.5;
        var dy = ((d4 - d0) + (d0 - d3)) * 0.5;
        var nx = dx * invR, ny = dy * invG, nz = z;
        var len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1e-6;
        nx /= len; ny /= len; nz /= len;
        var o = idx * 4;
        op[o] = Math.round((nx * 0.5 + 0.5) * 255);
        op[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        op[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        op[o + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  function makeFlatNormal(size) {
    size = size || 256;
    var c = document.createElement("canvas");
    c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "rgb(128,128,255)";
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  function applyNormParams() {
    var p = getGlobalNormParams();
    var applyAll = document.getElementById("norm-apply-all").checked;
    if (applyAll) normItems.forEach(function (it) { if (!it.flat) it.params = Object.assign({}, p); });
    else if (normSelected >= 0 && !normItems[normSelected].flat) normItems[normSelected].params = Object.assign({}, p);
    scheduleNormRegen();
  }
  function scheduleNormRegen() {
    if (normGenTimer) clearTimeout(normGenTimer);
    normGenTimer = setTimeout(regenAllNormals, 80);
  }
  function regenAllNormals() {
    normItems.forEach(function (it) {
      if (it.flat) {
        it.resultCanvas = makeFlatNormal(it.resizeOn ? it.resizeTo : 256);
      } else {
        var p = it.params;
        var blur = p.blurOn ? p.blur : 0;
        var c = generateNormalMap(it.img, p.bias, p.invR, p.invG, blur);
        if (it.resizeOn) c = resizeCanvas(c, it.resizeTo);
        it.resultCanvas = c;
      }
    });
    renderNormList();
    renderNormPreviews();
    updateNormOutName();
    document.getElementById("norm-save").disabled = !normItems.length;
    setStatus("Normal обновлены");
  }
  function updateNormOutName() {
    var el = document.getElementById("norm-out-name");
    if (normSelected >= 0 && normItems[normSelected])
      el.textContent = "Имя: " + normalOutName(normItems[normSelected].name);
    else el.textContent = normItems.length ? "Имена: ×" + normItems.length : "Имя: —";
  }

  function renderNormList() {
    var list = document.getElementById("norm-list");
    list.innerHTML = "";
    normItems.forEach(function (it, i) {
      var d = document.createElement("div");
      var cls = "file-item" + (i === normSelected ? " active" : "");
      if (it.info && (!it.info.sizeOk || it.info.stubBad)) cls += " warn-size";
      if (it.info && it.info.hasAlpha) cls += " warn-bit";
      d.className = cls;
      d.innerHTML = it.name + (it.resultCanvas ? " ✓" : "") +
        (it.info ? '<div class="meta">' + metaHtml(it.info) + "</div>" : '<div class="meta">flat 128,128,255</div>') +
        '<div class="row"><label><input type="checkbox" class="n-resz" data-i="' + i + '"' +
        (it.resizeOn ? " checked" : "") + '> Изменить размер</label>' +
        '<select class="sel n-rsz" data-i="' + i + '"' + (it.resizeOn ? "" : " disabled") + ">" +
        '<option value="256"' + (it.resizeTo === 256 ? " selected" : "") + ">256</option>" +
        '<option value="2048"' + (it.resizeTo === 2048 ? " selected" : "") + ">2048</option>" +
        '<option value="4096"' + (it.resizeTo === 4096 ? " selected" : "") + ">4096</option></select></div>";
      d.querySelector(".n-resz").addEventListener("click", function (e) { e.stopPropagation(); });
      d.querySelector(".n-resz").addEventListener("change", function (e) {
        e.stopPropagation();
        it.resizeOn = e.target.checked;
        scheduleNormRegen();
        renderNormList();
      });
      d.querySelector(".n-rsz").addEventListener("click", function (e) { e.stopPropagation(); });
      d.querySelector(".n-rsz").addEventListener("change", function (e) {
        e.stopPropagation();
        it.resizeTo = +e.target.value;
        scheduleNormRegen();
      });
      d.addEventListener("click", function () {
        normSelected = i;
        if (!it.flat && !document.getElementById("norm-apply-all").checked) setUIFromParams(it.params);
        renderNormList();
        renderNormPreviews();
        updateNormOutName();
      });
      list.appendChild(d);
    });
  }

  function renderNormPreviews() {
    var box = document.getElementById("norm-preview-list");
    box.innerHTML = "";
    normItems.forEach(function (it, i) {
      var row = document.createElement("div");
      row.className = "preview-row";
      if (i === normSelected) row.style.outline = "1px solid #5a8";
      var c1 = document.createElement("canvas");
      var c2 = document.createElement("canvas");
      if (it.img) drawThumb(c1, it.img); else drawThumb(c1, makeFlatNormal(64));
      if (it.resultCanvas) drawThumb(c2, it.resultCanvas);
      c1.onclick = function (e) { e.stopPropagation(); openFullscreen(it.img || makeFlatNormal(256), it.name); };
      c2.onclick = function (e) { e.stopPropagation(); if (it.resultCanvas) openFullscreen(it.resultCanvas, normalOutName(it.name)); };
      var p1 = document.createElement("div"); p1.className = "pair"; p1.appendChild(c1);
      var cap1 = document.createElement("div"); cap1.className = "caption"; cap1.textContent = "Оригинал"; p1.appendChild(cap1);
      var p2 = document.createElement("div"); p2.className = "pair"; p2.appendChild(c2);
      var cap2 = document.createElement("div"); cap2.className = "caption"; cap2.textContent = "Normal"; p2.appendChild(cap2);
      var info = document.createElement("div"); info.className = "row-info";
      info.innerHTML = '<div class="fname">' + normalOutName(it.name) + "</div>" +
        (it.info ? '<div class="meta">' + metaHtml(it.info) + "</div>" : "");
      row.appendChild(p1); row.appendChild(p2); row.appendChild(info);
      row.onclick = function () { normSelected = i; renderNormList(); renderNormPreviews(); updateNormOutName(); };
      box.appendChild(row);
    });
  }

  document.getElementById("norm-files").addEventListener("change", async function (e) {
    var files = filterPngFiles(e.target.files);
    for (var i = 0; i < files.length; i++) {
      try {
        var img = await loadImageFromFile(files[i]);
        normItems.push({
          file: files[i], img: img, name: files[i].name, flat: false,
          info: analyzeImage(img), params: defaultNormParams(),
          resultCanvas: null, resizeOn: false, resizeTo: 2048
        });
      } catch (err) { console.error(err); }
    }
    if (normSelected < 0 && normItems.length) normSelected = 0;
    applyNormParams();
  });

  document.getElementById("norm-add-flat").addEventListener("click", function () {
    var name = "T_Flat_Normal_1.1001.png";
    var n = 1001;
    while (normItems.some(function (x) { return x.name.indexOf("." + n + ".") !== -1; })) n++;
    name = "T_Flat_Normal_1." + n + ".png";
    normItems.push({
      img: null, name: name, flat: true, info: { w: 256, h: 256, hasAlpha: false, bits: 24, colorCount: 1, sizeOk: true, stubBad: false },
      params: defaultNormParams(), resultCanvas: makeFlatNormal(256), resizeOn: false, resizeTo: 256
    });
    normSelected = normItems.length - 1;
    renderNormList();
    renderNormPreviews();
    updateNormOutName();
    document.getElementById("norm-save").disabled = false;
    setStatus("Плоский Normal 128,128,255");
  });

  syncRangeNum("norm-bias", "norm-bias-num", applyNormParams);
  syncRangeNum("norm-blur", "norm-blur-num", applyNormParams);
  ["norm-inv-r", "norm-inv-g", "norm-blur-on", "norm-apply-all"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", applyNormParams);
  });

  document.getElementById("norm-save").addEventListener("click", async function () {
    var zip = new JSZip();
    var folder = zip.folder("normals");
    for (var i = 0; i < normItems.length; i++) {
      var it = normItems[i];
      if (!it.resultCanvas) continue;
      var blob = await canvasToPngBlob(it.resultCanvas, 24);
      folder.file(normalOutName(it.name), blob);
    }
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "normals.zip";
    a.click();
    setStatus("normals.zip 24 bit");
  });

  // ══════════ ERM ══════════
  var ermItems = [];
  var ermSelected = -1;
  var ermTimer = null;

  function parseUdimFromName(name) {
    var m = name.match(/\.(\d{4})\./) || name.match(/(\d{4})\.png$/i);
    return m ? parseInt(m[1], 10) : 1001;
  }
  function parseBaseFromDiffuse(name) {
    var base = name.replace(/\.[^.]+$/, "");
    base = base.replace(/_Diffuse(_\d+)?(\.\d{4})?$/i, "").replace(/_Diffuse/i, "");
    base = base.replace(/_\d+\.\d{4}$/, "");
    return base || "T_Texture";
  }
  function parseSuffixFromDiffuse(name) {
    var m = name.match(/_(\d+)\.\d{4}/);
    return m ? "_" + m[1] : "_1";
  }
  function ermFileName(it) { return it.base + "_ERM" + it.suffix + "." + it.udim + ".png"; }
  function sortErmByUdim() { ermItems.sort(function (a, b) { return a.udim - b.udim; }); }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function buildErmCanvas(it) {
    var w, h;
    if (it.type === "diffuse" && it.img) {
      w = it.img.naturalWidth; h = it.img.naturalHeight;
    } else { w = 256; h = 256; }
    if (it.resizeOn) { w = it.resizeTo; h = it.resizeTo; }
    var srcData = null;
    if (it.type === "diffuse" && it.img) {
      var sc = document.createElement("canvas");
      sc.width = it.img.naturalWidth; sc.height = it.img.naturalHeight;
      sc.getContext("2d").drawImage(it.img, 0, 0);
      if (it.resizeOn) sc = resizeCanvas(sc, it.resizeTo);
      srcData = sc.getContext("2d").getImageData(0, 0, w, h).data;
    }
    function sample(mode, constVal, srcCh, bright, contr, isMetal, thresh) {
      if (mode === "const" || !srcData) {
        var c = isMetal ? (constVal >= 0.5 ? 1 : 0) : clamp01(constVal);
        return function () { return c; };
      }
      return function (i) {
        var v = srcData[i * 4 + srcCh] / 255;
        v = clamp01((v - 0.5) * contr + 0.5 + bright);
        return isMetal ? (v >= thresh ? 1 : 0) : v;
      };
    }
    var eFn = sample(it.eMode, it.eVal, it.eSrc, it.eBright, it.eContr, false, 0);
    var rFn = sample(it.rMode, it.rVal, it.rSrc, it.rBright, it.rContr, false, 0);
    var mFn = sample(it.mMode, it.mVal, it.mSrc, 0, 1, true, it.mThresh);
    var out = document.createElement("canvas");
    out.width = w; out.height = h;
    var od = out.getContext("2d").createImageData(w, h);
    var p = od.data;
    for (var i = 0; i < w * h; i++) {
      var o = i * 4;
      p[o] = Math.round(eFn(i) * 255);
      p[o + 1] = Math.round(rFn(i) * 255);
      p[o + 2] = Math.round(mFn(i) * 255);
      p[o + 3] = 255;
    }
    out.getContext("2d").putImageData(od, 0, 0);
    return out;
  }

  function makeDefaultErmItem(type, img, name) {
    var base = "T_Texture", udim = 1001, suffix = "_1";
    if (name) {
      base = parseBaseFromDiffuse(name);
      udim = parseUdimFromName(name);
      suffix = parseSuffixFromDiffuse(name);
    }
    return {
      type: type, base: base, udim: udim, suffix: suffix, img: img || null,
      eMode: "const", eVal: 0, eSrc: 0, eBright: 0, eContr: 1,
      rMode: "const", rVal: 0.95, rSrc: 1, rBright: 0, rContr: 1,
      mMode: "const", mVal: 0, mSrc: 2, mThresh: 0.5,
      resizeOn: false, resizeTo: 256, resultCanvas: null,
      info: img ? analyzeImage(img) : { w: 256, h: 256, hasAlpha: false, bits: 24, colorCount: 1, sizeOk: true, stubBad: false }
    };
  }

  function renderErmList() {
    var list = document.getElementById("erm-list");
    list.innerHTML = "";
    ermItems.forEach(function (it, i) {
      var d = document.createElement("div");
      var cls = "file-item" + (i === ermSelected ? " active" : "");
      if (it.info && (!it.info.sizeOk || it.info.stubBad)) cls += " warn-size";
      if (it.info && it.info.hasAlpha) cls += " warn-bit";
      d.className = cls;
      d.innerHTML = ermFileName(it) + '<div class="meta">' + metaHtml(it.info) + "</div>";
      d.onclick = function () { selectErm(i); };
      list.appendChild(d);
    });
    document.getElementById("erm-download").disabled = !ermItems.length;
  }

  function renderErmPreviews() {
    var box = document.getElementById("erm-preview-list");
    box.innerHTML = "";
    ermItems.forEach(function (it, i) {
      if (!it.resultCanvas) it.resultCanvas = buildErmCanvas(it);
      var row = document.createElement("div");
      row.className = "preview-row";
      if (i === ermSelected) row.style.outline = "1px solid #5a8";
      var c1 = document.createElement("canvas");
      var c2 = document.createElement("canvas");
      if (it.img) drawThumb(c1, it.img);
      else { c1.width = 64; c1.height = 64; c1.getContext("2d").fillStyle = "#333"; c1.getContext("2d").fillRect(0, 0, 64, 64); }
      drawThumb(c2, it.resultCanvas);
      c1.onclick = function (e) { e.stopPropagation(); if (it.img) openFullscreen(it.img, "Diffuse"); };
      c2.onclick = function (e) { e.stopPropagation(); openFullscreen(it.resultCanvas, ermFileName(it)); };
      var p1 = document.createElement("div"); p1.className = "pair"; p1.appendChild(c1);
      var cap1 = document.createElement("div"); cap1.className = "caption"; cap1.textContent = it.img ? "Diffuse" : "—"; p1.appendChild(cap1);
      var p2 = document.createElement("div"); p2.className = "pair"; p2.appendChild(c2);
      var cap2 = document.createElement("div"); cap2.className = "caption"; cap2.textContent = "ERM"; p2.appendChild(cap2);
      var info = document.createElement("div"); info.className = "row-info";
      info.innerHTML = '<div class="fname">' + ermFileName(it) + '</div><div class="meta">' + metaHtml(it.info) + "</div>";
      row.appendChild(p1); row.appendChild(p2); row.appendChild(info);
      row.onclick = function () { selectErm(i); };
      box.appendChild(row);
    });
  }

  function selectErm(i) {
    ermSelected = i;
    var it = ermItems[i];
    var editor = document.getElementById("erm-editor");
    if (!it) { editor.style.display = "none"; renderErmList(); renderErmPreviews(); return; }
    editor.style.display = "block";
    document.getElementById("erm-base").value = it.base;
    document.getElementById("erm-udim").value = it.udim;
    document.getElementById("erm-suffix").value = it.suffix;
    document.getElementById("erm-out-name").textContent = "Имя: " + ermFileName(it);
    document.getElementById("erm-e-mode").value = it.eMode;
    document.getElementById("erm-e").value = it.eVal;
    document.getElementById("erm-e-num").value = Number(it.eVal).toFixed(2);
    document.getElementById("erm-e-src").value = it.eSrc;
    document.getElementById("erm-e-bright").value = it.eBright;
    document.getElementById("erm-e-contr").value = it.eContr;
    document.getElementById("erm-r-mode").value = it.rMode;
    document.getElementById("erm-r").value = it.rVal;
    document.getElementById("erm-r-num").value = Number(it.rVal).toFixed(2);
    document.getElementById("erm-r-src").value = it.rSrc;
    document.getElementById("erm-r-bright").value = it.rBright;
    document.getElementById("erm-r-contr").value = it.rContr;
    document.getElementById("erm-m-mode").value = it.mMode;
    document.getElementById("erm-m").value = String(it.mVal);
    document.getElementById("erm-m-src").value = it.mSrc;
    document.getElementById("erm-m-thresh").value = it.mThresh;
    document.getElementById("erm-resize-on").checked = it.resizeOn;
    document.getElementById("erm-resize").value = String(it.resizeTo);
    document.getElementById("erm-resize").disabled = !it.resizeOn;
    toggleErmModeRows();
    renderErmList();
    renderErmPreviews();
  }

  function toggleErmModeRows() {
    var eFrom = document.getElementById("erm-e-mode").value === "from";
    var rFrom = document.getElementById("erm-r-mode").value === "from";
    var mFrom = document.getElementById("erm-m-mode").value === "from";
    document.getElementById("erm-e-const-row").style.display = eFrom ? "none" : "flex";
    document.getElementById("erm-e-from-row").style.display = eFrom ? "flex" : "none";
    document.getElementById("erm-r-const-row").style.display = rFrom ? "none" : "flex";
    document.getElementById("erm-r-from-row").style.display = rFrom ? "flex" : "none";
    document.getElementById("erm-m-const-row").style.display = mFrom ? "none" : "flex";
    document.getElementById("erm-m-from-row").style.display = mFrom ? "flex" : "none";
  }

  function readErmEditor() {
    if (ermSelected < 0) return;
    var it = ermItems[ermSelected];
    it.base = document.getElementById("erm-base").value.trim() || "T_Texture";
    it.udim = parseInt(document.getElementById("erm-udim").value, 10) || 1001;
    it.suffix = document.getElementById("erm-suffix").value || "_1";
    it.eMode = document.getElementById("erm-e-mode").value;
    it.eVal = parseFloat(document.getElementById("erm-e-num").value) || 0;
    it.eSrc = parseInt(document.getElementById("erm-e-src").value, 10) || 0;
    it.eBright = parseFloat(document.getElementById("erm-e-bright").value) || 0;
    it.eContr = parseFloat(document.getElementById("erm-e-contr").value) || 1;
    it.rMode = document.getElementById("erm-r-mode").value;
    it.rVal = parseFloat(document.getElementById("erm-r-num").value) || 0;
    it.rSrc = parseInt(document.getElementById("erm-r-src").value, 10) || 0;
    it.rBright = parseFloat(document.getElementById("erm-r-bright").value) || 0;
    it.rContr = parseFloat(document.getElementById("erm-r-contr").value) || 1;
    it.mMode = document.getElementById("erm-m-mode").value;
    it.mVal = parseInt(document.getElementById("erm-m").value, 10) || 0;
    it.mSrc = parseInt(document.getElementById("erm-m-src").value, 10) || 0;
    it.mThresh = parseFloat(document.getElementById("erm-m-thresh").value) || 0.5;
    it.resizeOn = document.getElementById("erm-resize-on").checked;
    it.resizeTo = parseInt(document.getElementById("erm-resize").value, 10) || 256;
    document.getElementById("erm-resize").disabled = !it.resizeOn;
    document.getElementById("erm-out-name").textContent = "Имя: " + ermFileName(it);
  }

  function scheduleErmUpdate() {
    if (ermSelected < 0) return;
    readErmEditor();
    if (ermTimer) clearTimeout(ermTimer);
    ermTimer = setTimeout(function () {
      var it = ermItems[ermSelected];
      if (!it) return;
      it.resultCanvas = buildErmCanvas(it);
      sortErmByUdim();
      ermSelected = ermItems.indexOf(it);
      renderErmList();
      renderErmPreviews();
    }, 60);
  }

  document.getElementById("erm-add-solid").addEventListener("click", function () {
    var it = makeDefaultErmItem("solid", null, null);
    var used = {};
    ermItems.forEach(function (x) { used[x.udim] = true; });
    var u = 1001; while (used[u]) u++;
    it.udim = u;
    it.resultCanvas = buildErmCanvas(it);
    ermItems.push(it);
    sortErmByUdim();
    selectErm(ermItems.indexOf(it));
  });

  document.getElementById("erm-add-diffuse").addEventListener("click", function () {
    document.getElementById("erm-diffuse-pick").click();
  });
  document.getElementById("erm-diffuse-pick").addEventListener("change", async function (e) {
    var files = filterPngFiles(e.target.files);
    for (var i = 0; i < files.length; i++) {
      try {
        var img = await loadImageFromFile(files[i]);
        var it = makeDefaultErmItem("diffuse", img, files[i].name);
        it.resultCanvas = buildErmCanvas(it);
        ermItems.push(it);
      } catch (err) { console.error(err); }
    }
    sortErmByUdim();
    if (ermItems.length) selectErm(0);
    e.target.value = "";
  });

  document.getElementById("erm-remove").addEventListener("click", function () {
    if (ermSelected < 0) return;
    ermItems.splice(ermSelected, 1);
    ermSelected = Math.min(ermSelected, ermItems.length - 1);
    if (ermSelected >= 0) selectErm(ermSelected);
    else { document.getElementById("erm-editor").style.display = "none"; renderErmList(); renderErmPreviews(); }
  });

  document.getElementById("erm-resize-on").addEventListener("change", function () {
    document.getElementById("erm-resize").disabled = !this.checked;
    scheduleErmUpdate();
  });

  ["erm-e-mode", "erm-r-mode", "erm-m-mode"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", function () { toggleErmModeRows(); scheduleErmUpdate(); });
  });
  syncRangeNum("erm-e", "erm-e-num", scheduleErmUpdate);
  syncRangeNum("erm-r", "erm-r-num", scheduleErmUpdate);
  ["erm-base", "erm-udim", "erm-suffix", "erm-e-src", "erm-e-bright", "erm-e-contr",
   "erm-r-src", "erm-r-bright", "erm-r-contr", "erm-m", "erm-m-src", "erm-m-thresh", "erm-resize"].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener("input", scheduleErmUpdate); el.addEventListener("change", scheduleErmUpdate); }
  });

  document.getElementById("erm-download").addEventListener("click", async function () {
    if (ermSelected >= 0) readErmEditor();
    var zip = new JSZip();
    var folder = zip.folder("erm");
    for (var i = 0; i < ermItems.length; i++) {
      var it = ermItems[i];
      it.resultCanvas = buildErmCanvas(it);
      folder.file(ermFileName(it), await canvasToPngBlob(it.resultCanvas, 24));
    }
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "erm_textures.zip";
    a.click();
    setStatus("erm ZIP 24 bit");
  });


  // ══════════ CHECK ══════════
  var checkItems = []; // raw list
  var checkSets = [];  // grouped by key

  function parseTexName(name) {
    // T_Address_Diffuse_1.1001.png  or  T_Address_Normal_1.1001.png  or ERM
    var base = name.replace(/\.png$/i, "");
    var m = base.match(/^(T_.+)_(Diffuse|Normal|ERM)(_\d+)?\.(\d{4})$/i);
    if (m) {
      return {
        ok: true,
        prefix: "T_",
        address: m[1].replace(/^T_/i, ""),
        fullBase: m[1], // T_Address
        type: m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase().replace(/^eRM$/i, "ERM").replace(/^Erm$/, "ERM"),
        suffix: m[3] || "_1",
        udim: parseInt(m[4], 10),
        raw: name
      };
    }
    // normalize type casing
    var m2 = base.match(/^(T_.+)_(diffuse|normal|erm)(_\d+)?\.(\d{4})$/i);
    if (m2) {
      var typ = m2[2].toLowerCase();
      typ = typ === "diffuse" ? "Diffuse" : typ === "normal" ? "Normal" : "ERM";
      return {
        ok: true,
        prefix: "T_",
        address: m2[1].replace(/^T_/i, ""),
        fullBase: m2[1],
        type: typ,
        suffix: m2[3] || "_1",
        udim: parseInt(m2[4], 10),
        raw: name
      };
    }
    return { ok: false, raw: name, type: null, udim: null, fullBase: null, suffix: null, address: null };
  }

  function normalizeType(t) {
    if (!t) return null;
    var x = t.toLowerCase();
    if (x === "diffuse") return "Diffuse";
    if (x === "normal") return "Normal";
    if (x === "erm") return "ERM";
    return t;
  }

  function setKey(parsed) {
    return (parsed.fullBase || "") + "|" + (parsed.suffix || "_1") + "|" + (parsed.udim || 0);
  }

  function expectedName(fullBase, type, suffix, udim) {
    return fullBase + "_" + type + suffix + "." + udim + ".png";
  }

  function makeSolidCanvas(size, r, g, b) {
    var c = document.createElement("canvas");
    c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
    ctx.fillRect(0, 0, size, size);
    return c;
  }

  function rebuildCheckSets() {
    var map = {};
    var maskFrom = null;

    checkItems.forEach(function (it) {
      var p = it.parsed;
      if (!p || !p.ok) {
        var orphanKey = "__orphan__|" + it.name;
        if (!map[orphanKey]) {
          map[orphanKey] = {
            key: orphanKey, fullBase: null, suffix: null, udim: null,
            diffuse: null, normal: null, erm: null,
            orphans: [], namingBad: true
          };
        }
        map[orphanKey].orphans.push(it);
        return;
      }
      p.type = normalizeType(p.type);
      var k = setKey(p);
      if (!map[k]) {
        map[k] = {
          key: k,
          fullBase: p.fullBase,
          suffix: p.suffix,
          udim: p.udim,
          address: p.address,
          diffuse: null, normal: null, erm: null,
          orphans: [], namingBad: false
        };
      }
      if (p.type === "Diffuse") {
        map[k].diffuse = it;
        if (!maskFrom) maskFrom = p;
      } else if (p.type === "Normal") map[k].normal = it;
      else if (p.type === "ERM") map[k].erm = it;
      else map[k].orphans.push(it);
    });

    // naming mask check vs first diffuse
    checkSets = Object.keys(map).map(function (k) { return map[k]; });
    checkSets.sort(function (a, b) {
      var ua = a.udim || 0, ub = b.udim || 0;
      if (ua !== ub) return ua - ub;
      return (a.fullBase || "").localeCompare(b.fullBase || "");
    });

    checkSets.forEach(function (s) {
      s.incomplete = !s.diffuse || !s.normal || !s.erm;
      s.missing = [];
      if (!s.diffuse) s.missing.push("Diffuse");
      if (!s.normal) s.missing.push("Normal");
      if (!s.erm) s.missing.push("ERM");

      // resolution: Normal/ERM cannot be larger than Diffuse
      s.resBad = false;
      s.resMsg = [];
      if (s.diffuse) {
        var dw = s.diffuse.info.w;
        if (s.normal && s.normal.info.w > dw) {
          s.resBad = true;
          s.resMsg.push("Normal " + s.normal.info.w + " > Diffuse " + dw);
        }
        if (s.erm && s.erm.info.w > dw) {
          s.resBad = true;
          s.resMsg.push("ERM " + s.erm.info.w + " > Diffuse " + dw);
        }
      }

      // naming consistency with first diffuse mask
      s.namingWarn = [];
      if (maskFrom && s.fullBase && s.fullBase !== maskFrom.fullBase) {
        s.namingWarn.push("база отличается от первой Diffuse (" + maskFrom.fullBase + ")");
      }
      if (maskFrom && s.suffix && s.suffix !== maskFrom.suffix) {
        s.namingWarn.push("суффикс " + s.suffix + " ≠ " + maskFrom.suffix);
      }
    });

    window.__checkMask = maskFrom;
  }

  function renderCheckList() {
    rebuildCheckSets();
    var box = document.getElementById("check-list");
    var summary = document.getElementById("check-summary");
    var mask = window.__checkMask;
    var incomplete = checkSets.filter(function (s) { return s.incomplete; }).length;
    var resBad = checkSets.filter(function (s) { return s.resBad; }).length;
    var namingBad = checkItems.filter(function (it) { return !it.parsed || !it.parsed.ok; }).length;

    summary.innerHTML =
      (mask ? ('Маска: <span class="name-hint">' + mask.fullBase + '_&lt;Diffuse|Normal|ERM&gt;' + mask.suffix + '.&lt;UDIM&gt;.png</span> · ') : 'Нет Diffuse для маски · ') +
      'Наборов: ' + checkSets.length +
      (incomplete ? ' · <span class="warn-size">неполных: ' + incomplete + '</span>' : ' · <span style="color:#6c6">все полные</span>') +
      (resBad ? ' · <span class="warn-size">ошибка размера: ' + resBad + '</span>' : '') +
      (namingBad ? ' · <span class="warn-size">нейминг: ' + namingBad + '</span>' : '');

    function slotHtml(set, type, it) {
      var exp = set.fullBase ? expectedName(set.fullBase, type, set.suffix, set.udim) : type;
      if (!it) {
        return '<div class="check-slot missing">' +
          '<div class="slot-type">' + type + '</div>' +
          '<div class="missing-label">НЕТ<br><span class="slot-name">' + exp + '</span></div></div>';
      }
      var cls = "check-slot";
      if (it.info.hasAlpha) cls += " warn-bit";
      if (!it.info.sizeOk || it.info.stubBad) cls += " warn-size";
      return '<div class="' + cls + '" data-item="' + checkItems.indexOf(it) + '">' +
        '<div class="slot-type">' + type + '</div>' +
        '<div class="slot-name">' + it.name + '</div>' +
        '<div class="slot-meta">' + metaHtml(it.info) + '</div>' +
        '<canvas class="set-thumb" data-i="' + checkItems.indexOf(it) + '"></canvas>' +
        '<div class="row" style="margin-top:4px">' +
        '<label><input type="checkbox" class="set-resz" data-i="' + checkItems.indexOf(it) + '"' + (it.resizeOn ? ' checked' : '') + '> Размер</label>' +
        '<select class="sel set-rsz" data-i="' + checkItems.indexOf(it) + '"' + (it.resizeOn ? '' : ' disabled') + '>' +
        '<option value="256"' + (it.resizeTo === 256 ? ' selected' : '') + '>256</option>' +
        '<option value="2048"' + (it.resizeTo === 2048 ? ' selected' : '') + '>2048</option>' +
        '<option value="4096"' + (it.resizeTo === 4096 ? ' selected' : '') + '>4096</option></select>' +
        '<select class="sel set-bits" data-i="' + checkItems.indexOf(it) + '">' +
        '<option value="24"' + (it.outBits === 24 ? ' selected' : '') + '>24</option>' +
        '<option value="32"' + (it.outBits === 32 ? ' selected' : '') + '>32</option></select>' +
        '</div></div>';
    }

    var html = "";
    checkSets.forEach(function (s, si) {
      var cls = "check-set";
      if (s.incomplete) cls += " incomplete";
      if (s.resBad) cls += " bad-res";
      var head = '<div class="check-set-head">' +
        '<span class="udim">UDIM ' + (s.udim || "?") + '</span>' +
        '<span>' + (s.fullBase || "без маски") + (s.suffix || "") + '</span>';
      if (s.incomplete) head += '<span class="warn">неполный набор: нет ' + s.missing.join(", ") + '</span>';
      else head += '<span class="ok">полный набор</span>';
      if (s.resBad) head += '<span class="warn">размер: ' + s.resMsg.join("; ") + '</span>';
      if (s.namingWarn && s.namingWarn.length) head += '<span class="warn">' + s.namingWarn.join("; ") + '</span>';
      if (s.namingBad) head += '<span class="warn">имя не по маске T_&lt;Адрес&gt;_Diffuse|Normal|ERM_…</span>';
      head += '</div>';

      html += '<div class="' + cls + '" data-set="' + si + '">' + head +
        '<div class="check-triple">' +
        slotHtml(s, "Diffuse", s.diffuse) +
        slotHtml(s, "Normal", s.normal) +
        slotHtml(s, "ERM", s.erm) +
        '</div>';

      if (s.orphans && s.orphans.length) {
        html += '<div class="hint warn-size" style="margin-top:6px">Лишние/неразобранные: ' +
          s.orphans.map(function (o) { return o.name; }).join(", ") + '</div>';
      }
      html += '</div>';
    });

    box.innerHTML = html || '<div class="hint">Загрузите PNG текстуры набора</div>';

    box.querySelectorAll(".set-thumb").forEach(function (cv) {
      var i = +cv.getAttribute("data-i");
      var it = checkItems[i];
      if (!it) return;
      drawThumb(cv, it.img, 120);
      cv.onclick = function () { openFullscreen(it.img, it.name); };
    });
    box.querySelectorAll(".set-resz").forEach(function (cb) {
      cb.addEventListener("change", function () {
        var i = +cb.getAttribute("data-i");
        checkItems[i].resizeOn = cb.checked;
        renderCheckList();
      });
    });
    box.querySelectorAll(".set-rsz").forEach(function (sel) {
      sel.addEventListener("change", function () {
        checkItems[+sel.getAttribute("data-i")].resizeTo = +sel.value;
      });
    });
    box.querySelectorAll(".set-bits").forEach(function (sel) {
      sel.addEventListener("change", function () {
        checkItems[+sel.getAttribute("data-i")].outBits = +sel.value;
      });
    });

    var hasIncomplete = checkSets.some(function (s) { return s.incomplete && s.fullBase; });
    document.getElementById("check-fill-stubs").disabled = !hasIncomplete;
    document.getElementById("check-download").disabled = !checkItems.length;
  }

  document.getElementById("check-files").addEventListener("change", async function (e) {
    var files = filterPngFiles(e.target.files);
    checkItems = [];
    setStatus("Анализ...");
    for (var i = 0; i < files.length; i++) {
      try {
        var img = await loadImageFromFile(files[i]);
        var info = analyzeImage(img);
        var parsed = parseTexName(files[i].name);
        if (parsed.ok) parsed.type = normalizeType(parsed.type);
        checkItems.push({
          file: files[i], img: img, name: files[i].name, info: info, parsed: parsed,
          resizeOn: false, resizeTo: info.sizeOk ? info.w : 2048,
          outBits: info.hasAlpha ? 32 : 24,
          canvas: null
        });
      } catch (err) { console.error(err); }
    }
    renderCheckList();
    setStatus("Проверка: " + checkItems.length + " PNG, наборов: " + checkSets.length);
  });

  document.getElementById("check-fill-stubs").addEventListener("click", function () {
    rebuildCheckSets();
    var added = 0;
    checkSets.forEach(function (s) {
      if (!s.fullBase || !s.udim) return;
      var dSize = s.diffuse ? s.diffuse.info.w : 256;
      // stubs at min(diffuse size, 256) — typically 256 solid
      var stubSize = 256;
      if (s.diffuse && ALLOWED_SIZES.indexOf(dSize) !== -1) {
        // stub can be 256 even if diffuse is 2k — allowed
        stubSize = 256;
      }
      if (!s.normal) {
        var nName = expectedName(s.fullBase, "Normal", s.suffix, s.udim);
        var nCanvas = makeSolidCanvas(stubSize, 128, 128, 255);
        // create fake img from canvas
        var nImg = new Image();
        nImg.width = stubSize; nImg.height = stubSize;
        // store canvas as source
        var nItem = {
          file: null, img: null, name: nName,
          info: { w: stubSize, h: stubSize, hasAlpha: false, bits: 24, colorCount: 1, sizeOk: true, stubBad: false },
          parsed: parseTexName(nName),
          resizeOn: false, resizeTo: stubSize, outBits: 24,
          canvas: nCanvas, isStub: true
        };
        // use canvas as drawable
        nItem.img = nCanvas;
        checkItems.push(nItem);
        added++;
      }
      if (!s.erm) {
        var eName = expectedName(s.fullBase, "ERM", s.suffix, s.udim);
        // default ERM: E=0, R=0.95, M=0 → rgb(0, 242, 0) approx 0.95*255=242
        var eCanvas = makeSolidCanvas(stubSize, 0, 242, 0);
        var eItem = {
          file: null, img: eCanvas, name: eName,
          info: { w: stubSize, h: stubSize, hasAlpha: false, bits: 24, colorCount: 1, sizeOk: true, stubBad: false },
          parsed: parseTexName(eName),
          resizeOn: false, resizeTo: stubSize, outBits: 24,
          canvas: eCanvas, isStub: true
        };
        checkItems.push(eItem);
        added++;
      }
    });
    renderCheckList();
    setStatus("Добавлено заглушек: " + added);
    if (added) alert("Создано заглушек: " + added + "\nNormal = RGB(128,128,255)\nERM = RGB(0,242,0) — E=0 R≈0.95 M=0\nСкачайте ZIP чтобы сохранить.");
  });

  document.getElementById("check-download").addEventListener("click", async function () {
    var zip = new JSZip();
    for (var i = 0; i < checkItems.length; i++) {
      var it = checkItems[i];
      var c = it.canvas ? it.canvas : imgToCanvas(it.img);
      if (it.resizeOn) c = resizeCanvas(c, it.resizeTo);
      if (it.outBits === 24) {
        var flat = document.createElement("canvas");
        flat.width = c.width; flat.height = c.height;
        var fctx = flat.getContext("2d");
        fctx.fillStyle = "#000";
        fctx.fillRect(0, 0, flat.width, flat.height);
        fctx.drawImage(c, 0, 0);
        c = flat;
      }
      zip.file(it.name, await canvasToPngBlob(c, it.outBits));
    }
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "checked_textures.zip";
    a.click();
    setStatus("ZIP готов (" + checkItems.length + ")");
  });


  setStatus("Готов · только PNG · выход 24 bit");
})();
