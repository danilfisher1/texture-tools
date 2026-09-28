(function () {
  "use strict";

  // ── Tabs ──
  document.querySelectorAll(".tab").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab").forEach(function (t) { t.classList.remove("active"); });
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.getElementById("panel-" + btn.dataset.tab).classList.add("active");
    });
  });

  function setStatus(msg) {
    document.getElementById("status").textContent = msg;
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Failed: " + file.name)); };
      img.src = url;
    });
  }

  function syncRangeNum(rangeId, numId, onChange) {
    var r = document.getElementById(rangeId);
    var n = document.getElementById(numId);
    r.addEventListener("input", function () {
      n.value = r.value;
      if (onChange) onChange();
    });
    n.addEventListener("change", function () {
      var v = parseFloat(n.value);
      if (isNaN(v)) return;
      r.value = v;
      n.value = v;
      if (onChange) onChange();
    });
  }

  // ══════════════════════════════════════
  // 1. 90% PAD
  // ══════════════════════════════════════
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
    for (var i = 0; i < 3; i++)
      for (var j = 0; j < 3; j++)
        bctx.drawImage(sc, i * sw, j * sh);
    var cx = sw + Math.floor(sw / 2);
    var cy = sh + Math.floor(sh / 2);
    var left = cx - Math.floor(w / 2);
    var top = cy - Math.floor(h / 2);
    var out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").drawImage(big, left, top, w, h, 0, 0, w, h);
    return out;
  }

  document.getElementById("pad-run").addEventListener("click", async function () {
    var files = document.getElementById("pad-files").files;
    if (!files || !files.length) { alert("Select textures"); return; }
    var scale = parseFloat(document.getElementById("pad-scale").value) || 0.9;
    var logEl = document.getElementById("pad-log");
    logEl.textContent = "";
    setStatus("Processing...");
    var zip = new JSZip();
    var folder = zip.folder("90");
    var ok = 0;
    for (var i = 0; i < files.length; i++) {
      try {
        logEl.textContent += "[" + (i + 1) + "/" + files.length + "] " + files[i].name + " ...\n";
        var img = await loadImageFromFile(files[i]);
        var canvas = processPadImage(img, scale);
        var blob = await new Promise(function (r) { canvas.toBlob(r, "image/png"); });
        folder.file(files[i].name, blob);
        ok++;
        logEl.textContent += "  OK " + img.naturalWidth + "x" + img.naturalHeight + "\n";
      } catch (e) {
        logEl.textContent += "  ERR " + e.message + "\n";
      }
    }
    if (!ok) { setStatus("Nothing processed"); return; }
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "textures_90.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    logEl.textContent += "--- Done " + ok + "/" + files.length + "\n";
    setStatus("Ready — " + ok + " in ZIP");
  });

  // ══════════════════════════════════════
  // 2. NORMAL MAP
  // ══════════════════════════════════════
  var normItems = []; // { file, img, params, resultCanvas, name }
  var normSelected = -1;

  function defaultNormParams() {
    return {
      bias: 50,
      invR: false,
      invG: false, // off = DirectX
      blurOn: false,
      blur: 0
    };
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
    var invR = invertR ? -1 : 1;
    var invG = invertG ? -1 : 1;
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

  function drawToCanvas(canvasEl, src, maxSize) {
    maxSize = maxSize || 360;
    var w = src.width || src.naturalWidth;
    var h = src.height || src.naturalHeight;
    var s = Math.min(1, maxSize / Math.max(w, h));
    var dw = Math.round(w * s), dh = Math.round(h * s);
    canvasEl.width = dw; canvasEl.height = dh;
    var ctx = canvasEl.getContext("2d");
    ctx.clearRect(0, 0, dw, dh);
    ctx.drawImage(src, 0, 0, dw, dh);
  }

  function renderNormList() {
    var list = document.getElementById("norm-list");
    list.innerHTML = "";
    normItems.forEach(function (it, i) {
      var d = document.createElement("div");
      d.className = "file-item" + (i === normSelected ? " active" : "");
      d.textContent = it.name + (it.resultCanvas ? " ✓" : "");
      d.onclick = function () { selectNorm(i); };
      list.appendChild(d);
    });
  }

  function selectNorm(i) {
    normSelected = i;
    renderNormList();
    var it = normItems[i];
    if (!it) return;
    var applyAll = document.getElementById("norm-apply-all").checked;
    if (!applyAll) setUIFromParams(it.params);
    drawToCanvas(document.getElementById("norm-orig"), it.img);
    if (it.resultCanvas) {
      drawToCanvas(document.getElementById("norm-result"), it.resultCanvas);
    } else {
      var c = document.getElementById("norm-result");
      c.width = 256; c.height = 256;
      c.getContext("2d").fillStyle = "#111";
      c.getContext("2d").fillRect(0, 0, 256, 256);
    }
  }

  function applyParamsToSelectedOrAll() {
    var p = getGlobalNormParams();
    var applyAll = document.getElementById("norm-apply-all").checked;
    if (applyAll) {
      normItems.forEach(function (it) { it.params = Object.assign({}, p); });
    } else if (normSelected >= 0) {
      normItems[normSelected].params = Object.assign({}, p);
    }
  }

  document.getElementById("norm-files").addEventListener("change", async function (e) {
    var files = e.target.files;
    if (!files.length) return;
    setStatus("Loading...");
    for (var i = 0; i < files.length; i++) {
      try {
        var img = await loadImageFromFile(files[i]);
        normItems.push({
          file: files[i],
          img: img,
          name: files[i].name,
          params: defaultNormParams(),
          resultCanvas: null
        });
      } catch (err) { console.error(err); }
    }
    renderNormList();
    if (normSelected < 0 && normItems.length) selectNorm(0);
    setStatus("Loaded " + normItems.length + " textures");
    document.getElementById("norm-save").disabled = true;
  });

  syncRangeNum("norm-bias", "norm-bias-num", applyParamsToSelectedOrAll);
  syncRangeNum("norm-blur", "norm-blur-num", applyParamsToSelectedOrAll);
  ["norm-inv-r", "norm-inv-g", "norm-blur-on", "norm-apply-all"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", applyParamsToSelectedOrAll);
  });

  document.getElementById("norm-gen").addEventListener("click", function () {
    if (!normItems.length) { alert("Load textures first"); return; }
    applyParamsToSelectedOrAll();
    setStatus("Generating...");
    setTimeout(function () {
      normItems.forEach(function (it) {
        var p = it.params;
        var blur = p.blurOn ? p.blur : 0;
        it.resultCanvas = generateNormalMap(it.img, p.bias, p.invR, p.invG, blur);
      });
      renderNormList();
      if (normSelected >= 0) selectNorm(normSelected);
      document.getElementById("norm-save").disabled = false;
      setStatus("Normals ready — " + normItems.length);
    }, 20);
  });

  document.getElementById("norm-save").addEventListener("click", async function () {
    var zip = new JSZip();
    var folder = zip.folder("normals");
    for (var i = 0; i < normItems.length; i++) {
      var it = normItems[i];
      if (!it.resultCanvas) continue;
      var base = it.name.replace(/\.[^.]+$/, "");
      var lower = base.toLowerCase();
      var idx = lower.indexOf("diffuse");
      var newBase = idx !== -1 ? base.substring(0, idx) + "Normal" + base.substring(idx + 7) : base + "_Normal";
      var blob = await new Promise(function (r) { it.resultCanvas.toBlob(r, "image/png"); });
      folder.file(newBase + ".png", blob);
    }
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "normals.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Saved normals.zip");
  });

  // ══════════════════════════════════════
  // 3. ERM
  // ══════════════════════════════════════
  // item: { type:'solid'|'diffuse', base, udim, suffix, img?,
  //   eMode, eVal, eSrc, eBright, eContr,
  //   rMode, rVal, rSrc, rBright, rContr,
  //   mMode, mVal, mSrc, mThresh,
  //   resultCanvas }
  var ermItems = [];
  var ermSelected = -1;

  function parseUdimFromName(name) {
    var m = name.match(/\.(\d{4})\./);
    if (m) return parseInt(m[1], 10);
    m = name.match(/(\d{4})\.(png|jpg|jpeg|tga|bmp|webp)$/i);
    if (m) return parseInt(m[1], 10);
    return 1001;
  }

  function parseBaseFromDiffuse(name) {
    // T_Remizova_18_A_Ground_Diffuse_1.1001.png → T_Remizova_18_A_Ground
    var base = name.replace(/\.[^.]+$/, "");
    base = base.replace(/_Diffuse(_\d+)?(\.\d{4})?$/i, "");
    base = base.replace(/_Diffuse/i, "");
    // also strip trailing _1.1001 style if left
    base = base.replace(/_\d+\.\d{4}$/, "");
    return base || "T_Texture";
  }

  function parseSuffixFromDiffuse(name) {
    // look for _1 before .udim
    var m = name.match(/_(\d+)\.\d{4}/);
    if (m) return "_" + m[1];
    return "_1";
  }

  function ermFileName(it) {
    return it.base + "_ERM" + it.suffix + "." + it.udim + ".png";
  }

  function sortErmByUdim() {
    ermItems.sort(function (a, b) { return a.udim - b.udim; });
  }

  function renderErmList() {
    var list = document.getElementById("erm-list");
    list.innerHTML = "";
    ermItems.forEach(function (it, i) {
      var d = document.createElement("div");
      d.className = "file-item" + (i === ermSelected ? " active" : "");
      var label = ermFileName(it);
      d.innerHTML = label + '<div class="meta">' + it.type + (it.img ? " " + it.img.naturalWidth + "x" + it.img.naturalHeight : " 256x256") + "</div>";
      d.onclick = function () { selectErm(i); };
      list.appendChild(d);
    });
    document.getElementById("erm-download").disabled = !ermItems.length;
  }

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }

  function buildErmCanvas(it) {
    var w, h;
    if (it.type === "diffuse" && it.img) {
      w = it.img.naturalWidth;
      h = it.img.naturalHeight;
    } else {
      w = 256; h = 256;
    }

    var srcData = null;
    if (it.type === "diffuse" && it.img) {
      var sc = document.createElement("canvas");
      sc.width = w; sc.height = h;
      var sctx = sc.getContext("2d");
      sctx.drawImage(it.img, 0, 0);
      srcData = sctx.getImageData(0, 0, w, h).data;
    }

    function sampleChannel(mode, constVal, srcCh, bright, contr, isMetal, thresh) {
      if (mode === "const" || !srcData) {
        var c = isMetal ? (constVal >= 0.5 ? 1 : 0) : clamp01(constVal);
        return function () { return c; };
      }
      return function (i) {
        var v = srcData[i * 4 + srcCh] / 255;
        v = (v - 0.5) * contr + 0.5 + bright;
        v = clamp01(v);
        if (isMetal) return v >= thresh ? 1 : 0;
        return v;
      };
    }

    var eFn = sampleChannel(it.eMode, it.eVal, it.eSrc, it.eBright, it.eContr, false, 0);
    var rFn = sampleChannel(it.rMode, it.rVal, it.rSrc, it.rBright, it.rContr, false, 0);
    var mFn = sampleChannel(it.mMode, it.mVal, it.mSrc, 0, 1, true, it.mThresh);

    var out = document.createElement("canvas");
    out.width = w; out.height = h;
    var octx = out.getContext("2d");
    var od = octx.createImageData(w, h);
    var p = od.data;
    var n = w * h;
    for (var i = 0; i < n; i++) {
      var o = i * 4;
      p[o]     = Math.round(eFn(i) * 255);
      p[o + 1] = Math.round(rFn(i) * 255);
      p[o + 2] = Math.round(mFn(i) * 255);
      p[o + 3] = 255;
    }
    octx.putImageData(od, 0, 0);
    return out;
  }

  function selectErm(i) {
    ermSelected = i;
    renderErmList();
    var it = ermItems[i];
    var editor = document.getElementById("erm-editor");
    if (!it) {
      editor.style.display = "none";
      return;
    }
    editor.style.display = "block";

    document.getElementById("erm-base").value = it.base;
    document.getElementById("erm-udim").value = it.udim;
    document.getElementById("erm-suffix").value = it.suffix;

    document.getElementById("erm-e-mode").value = it.eMode;
    document.getElementById("erm-e").value = it.eVal;
    document.getElementById("erm-e-num").value = it.eVal.toFixed(2);
    document.getElementById("erm-e-src").value = it.eSrc;
    document.getElementById("erm-e-bright").value = it.eBright;
    document.getElementById("erm-e-contr").value = it.eContr;

    document.getElementById("erm-r-mode").value = it.rMode;
    document.getElementById("erm-r").value = it.rVal;
    document.getElementById("erm-r-num").value = it.rVal.toFixed(2);
    document.getElementById("erm-r-src").value = it.rSrc;
    document.getElementById("erm-r-bright").value = it.rBright;
    document.getElementById("erm-r-contr").value = it.rContr;

    document.getElementById("erm-m-mode").value = it.mMode;
    document.getElementById("erm-m").value = String(it.mVal);
    document.getElementById("erm-m-src").value = it.mSrc;
    document.getElementById("erm-m-thresh").value = it.mThresh;

    toggleErmModeRows();

    // previews
    var srcCv = document.getElementById("erm-src-preview");
    if (it.img) {
      drawToCanvas(srcCv, it.img);
    } else {
      srcCv.width = 256; srcCv.height = 256;
      var ctx = srcCv.getContext("2d");
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#666";
      ctx.font = "12px Tahoma";
      ctx.fillText("Solid (no diffuse)", 70, 128);
    }

    it.resultCanvas = buildErmCanvas(it);
    drawToCanvas(document.getElementById("erm-preview"), it.resultCanvas);
    document.getElementById("erm-info").textContent =
      ermFileName(it) + " — " + it.resultCanvas.width + "×" + it.resultCanvas.height;
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

  function readErmEditorIntoSelected() {
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
  }

  function makeDefaultErmItem(type, img, name) {
    var base = "T_Texture";
    var udim = 1001;
    var suffix = "_1";
    if (name) {
      base = parseBaseFromDiffuse(name);
      udim = parseUdimFromName(name);
      suffix = parseSuffixFromDiffuse(name);
    }
    return {
      type: type,
      base: base,
      udim: udim,
      suffix: suffix,
      img: img || null,
      eMode: "const", eVal: 0, eSrc: 0, eBright: 0, eContr: 1,
      rMode: "const", rVal: 0.95, rSrc: 1, rBright: 0, rContr: 1,
      mMode: "const", mVal: 0, mSrc: 2, mThresh: 0.5,
      resultCanvas: null
    };
  }

  document.getElementById("erm-add-solid").addEventListener("click", function () {
    var it = makeDefaultErmItem("solid", null, null);
    // next free udim
    var used = {};
    ermItems.forEach(function (x) { used[x.udim] = true; });
    var u = 1001;
    while (used[u]) u++;
    it.udim = u;
    ermItems.push(it);
    sortErmByUdim();
    renderErmList();
    selectErm(ermItems.indexOf(it));
    setStatus("Added solid ERM UDIM " + u);
  });

  document.getElementById("erm-add-diffuse").addEventListener("click", function () {
    document.getElementById("erm-diffuse-pick").click();
  });

  document.getElementById("erm-diffuse-pick").addEventListener("change", async function (e) {
    var files = e.target.files;
    if (!files.length) return;
    for (var i = 0; i < files.length; i++) {
      try {
        var img = await loadImageFromFile(files[i]);
        var it = makeDefaultErmItem("diffuse", img, files[i].name);
        // if from diffuse, default R channel mode could stay const; user picks
        ermItems.push(it);
      } catch (err) { console.error(err); }
    }
    sortErmByUdim();
    renderErmList();
    if (ermItems.length) selectErm(0);
    setStatus("Added " + files.length + " from Diffuse");
    e.target.value = "";
  });

  document.getElementById("erm-apply").addEventListener("click", function () {
    if (ermSelected < 0) return;
    readErmEditorIntoSelected();
    sortErmByUdim();
    var it = ermItems[ermSelected];
    // re-find after sort
    var idx = ermItems.indexOf(it);
    selectErm(idx);
    setStatus("Updated " + ermFileName(it));
  });

  document.getElementById("erm-remove").addEventListener("click", function () {
    if (ermSelected < 0) return;
    ermItems.splice(ermSelected, 1);
    ermSelected = Math.min(ermSelected, ermItems.length - 1);
    renderErmList();
    if (ermSelected >= 0) selectErm(ermSelected);
    else {
      document.getElementById("erm-editor").style.display = "none";
      document.getElementById("erm-info").textContent = "No ERM selected";
    }
  });

  // mode toggles
  ["erm-e-mode", "erm-r-mode", "erm-m-mode"].forEach(function (id) {
    document.getElementById(id).addEventListener("change", toggleErmModeRows);
  });

  // sync E/R range-num
  syncRangeNum("erm-e", "erm-e-num");
  syncRangeNum("erm-r", "erm-r-num");

  document.getElementById("erm-download").addEventListener("click", async function () {
    if (!ermItems.length) return;
    // ensure all built with latest settings
    if (ermSelected >= 0) readErmEditorIntoSelected();
    var zip = new JSZip();
    var folder = zip.folder("erm");
    for (var i = 0; i < ermItems.length; i++) {
      var it = ermItems[i];
      it.resultCanvas = buildErmCanvas(it);
      var blob = await new Promise(function (r) { it.resultCanvas.toBlob(r, "image/png"); });
      folder.file(ermFileName(it), blob);
    }
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "erm_textures.zip";
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("Downloaded erm_textures.zip (" + ermItems.length + ")");
  });

  setStatus("Ready");
})();
