/* Texture Tools — client-side processing */

(function () {
  "use strict";

  // ── Tabs ──────────────────────────────────────────────
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

  function logPad(msg) {
    var el = document.getElementById("pad-log");
    el.textContent += msg + "\n";
    el.scrollTop = el.scrollHeight;
  }

  // ══════════════════════════════════════════════════════
  // 1. 90% Edge Pad
  // ══════════════════════════════════════════════════════

  function processPadImage(img, scale) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var sw = Math.max(1, Math.round(w * scale));
    var sh = Math.max(1, Math.round(h * scale));

    // Scale down
    var sc = document.createElement("canvas");
    sc.width = sw;
    sc.height = sh;
    var sctx = sc.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(img, 0, 0, sw, sh);

    // 3×3 tile
    var big = document.createElement("canvas");
    big.width = sw * 3;
    big.height = sh * 3;
    var bctx = big.getContext("2d");
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 3; j++) {
        bctx.drawImage(sc, i * sw, j * sh);
      }
    }

    // Center crop to original size
    var cx = sw + Math.floor(sw / 2);
    var cy = sh + Math.floor(sh / 2);
    var left = cx - Math.floor(w / 2);
    var top = cy - Math.floor(h / 2);

    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var octx = out.getContext("2d");
    octx.drawImage(big, left, top, w, h, 0, 0, w, h);

    return out;
  }

  function loadImageFromFile(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load " + file.name));
      };
      img.src = url;
    });
  }

  document.getElementById("pad-run").addEventListener("click", async function () {
    var input = document.getElementById("pad-files");
    var files = input.files;
    if (!files || files.length === 0) {
      alert("Select one or more textures first.");
      return;
    }

    var scale = parseFloat(document.getElementById("pad-scale").value) || 0.9;
    if (scale < 0.5 || scale > 0.99) {
      alert("Scale must be between 0.50 and 0.99");
      return;
    }

    var logEl = document.getElementById("pad-log");
    logEl.textContent = "";
    setStatus("Processing...");

    var zip = new JSZip();
    var folder = zip.folder("90");
    var ok = 0;

    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      try {
        logPad("[" + (i + 1) + "/" + files.length + "] " + file.name + " ...");
        var img = await loadImageFromFile(file);
        var canvas = processPadImage(img, scale);
        var blob = await new Promise(function (res) {
          canvas.toBlob(res, "image/png");
        });
        folder.file(file.name, blob);
        ok++;
        logPad("  OK " + img.naturalWidth + "×" + img.naturalHeight);
      } catch (e) {
        logPad("  ERROR: " + e.message);
      }
    }

    if (ok === 0) {
      setStatus("Nothing processed");
      return;
    }

    setStatus("Building ZIP...");
    var content = await zip.generateAsync({ type: "blob" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(content);
    a.download = "textures_90.zip";
    a.click();
    URL.revokeObjectURL(a.href);

    logPad("--- Done: " + ok + " / " + files.length + " → textures_90.zip");
    setStatus("Ready — " + ok + " files in ZIP");
  });

  // ══════════════════════════════════════════════════════
  // 2. Normal Map (SmartNormal → DirectX)
  // ══════════════════════════════════════════════════════

  var normSourceImg = null;
  var normResultCanvas = null;

  // Sliders live update labels
  document.getElementById("norm-bias").addEventListener("input", function () {
    document.getElementById("norm-bias-val").textContent = this.value;
  });
  document.getElementById("norm-blur").addEventListener("input", function () {
    document.getElementById("norm-blur-val").textContent = this.value;
  });

  document.getElementById("norm-file").addEventListener("change", function (e) {
    var file = e.target.files[0];
    if (!file) return;
    loadImageFromFile(file).then(function (img) {
      normSourceImg = img;
      normResultCanvas = null;
      document.getElementById("norm-save").disabled = true;
      setStatus("Loaded: " + file.name + " (" + img.naturalWidth + "×" + img.naturalHeight + ")");
      // clear preview
      var cv = document.getElementById("norm-preview");
      var ctx = cv.getContext("2d");
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, cv.width, cv.height);
    }).catch(function (err) {
      alert(err.message);
    });
  });

  /**
   * Port of SmartNormalMapFilter fragment shader.
   * Uses red channel as height. Output RGB normal in [0..255].
   */
  function generateNormalMap(img, bias, invertR, invertG, blurAmt) {
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;

    // Optional blur via canvas filter (approx)
    var srcCanvas = document.createElement("canvas");
    srcCanvas.width = w;
    srcCanvas.height = h;
    var sctx = srcCanvas.getContext("2d");
    if (blurAmt > 0.1) {
      sctx.filter = "blur(" + (blurAmt * 0.4) + "px)";
    }
    sctx.drawImage(img, 0, 0);
    sctx.filter = "none";

    var srcData = sctx.getImageData(0, 0, w, h);
    var px = srcData.data;

    // Height from red channel
    var height = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) {
      height[i] = px[i * 4] / 255.0;
    }

    var invR = invertR ? -1.0 : 1.0;
    var invG = invertG ? -1.0 : 1.0;
    var z = 1.0 - ((bias - 0.1) / 100.0);
    if (z < 0.01) z = 0.01;

    var out = document.createElement("canvas");
    out.width = w;
    out.height = h;
    var octx = out.getContext("2d");
    var outData = octx.createImageData(w, h);
    var op = outData.data;

    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var idx = y * w + x;

        // Neighbours (clamp)
        var d0 = height[idx];
        var d1 = height[y * w + Math.min(x + 1, w - 1)]; // +X
        var d2 = height[y * w + Math.max(x - 1, 0)];     // -X
        var d3 = height[Math.min(y + 1, h - 1) * w + x]; // +Y
        var d4 = height[Math.max(y - 1, 0) * w + x];     // -Y

        var dx = ((d2 - d0) + (d0 - d1)) * 0.5;
        var dy = ((d4 - d0) + (d0 - d3)) * 0.5;

        var nx = dx * invR;
        var ny = dy * invG;
        var nz = z;

        var len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (len < 1e-6) len = 1e-6;
        nx /= len;
        ny /= len;
        nz /= len;

        var o = idx * 4;
        op[o]     = Math.round((nx * 0.5 + 0.5) * 255);
        op[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        op[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        op[o + 3] = 255;
      }
    }

    octx.putImageData(outData, 0, 0);
    return out;
  }

  function drawPreview(srcCanvas) {
    var cv = document.getElementById("norm-preview");
    var ctx = cv.getContext("2d");
    var max = 512;
    var w = srcCanvas.width;
    var h = srcCanvas.height;
    var scale = Math.min(1, max / Math.max(w, h));
    var dw = Math.round(w * scale);
    var dh = Math.round(h * scale);
    cv.width = dw;
    cv.height = dh;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(srcCanvas, 0, 0, dw, dh);
  }

  document.getElementById("norm-gen").addEventListener("click", function () {
    if (!normSourceImg) {
      alert("Load a texture first.");
      return;
    }

    setStatus("Generating normal map...");
    // Defer so UI can update
    setTimeout(function () {
      var bias = parseFloat(document.getElementById("norm-bias").value) || 50;
      var invR = document.getElementById("norm-inv-r").checked;
      var invG = document.getElementById("norm-inv-g").checked;
      var blurOn = document.getElementById("norm-blur-on").checked;
      var blurAmt = blurOn ? (parseFloat(document.getElementById("norm-blur").value) || 0) : 0;

      try {
        normResultCanvas = generateNormalMap(normSourceImg, bias, invR, invG, blurAmt);
        drawPreview(normResultCanvas);
        document.getElementById("norm-save").disabled = false;
        setStatus("Normal ready — " + normResultCanvas.width + "×" + normResultCanvas.height);
      } catch (e) {
        alert("Error: " + e.message);
        setStatus("Error");
      }
    }, 30);
  });

  document.getElementById("norm-save").addEventListener("click", function () {
    if (!normResultCanvas) return;

    var fileInput = document.getElementById("norm-file");
    var origName = (fileInput.files[0] && fileInput.files[0].name) || "texture.png";
    var base = origName.replace(/\.[^.]+$/, "");
    var lower = base.toLowerCase();
    var idx = lower.indexOf("diffuse");
    var newBase;
    if (idx !== -1) {
      newBase = base.substring(0, idx) + "Normal" + base.substring(idx + 7);
    } else {
      newBase = base + "_Normal";
    }
    var outName = newBase + ".png";

    normResultCanvas.toBlob(function (blob) {
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = outName;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus("Saved: " + outName);
    }, "image/png");
  });

  setStatus("Ready");
})();
