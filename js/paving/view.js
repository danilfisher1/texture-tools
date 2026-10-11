// WebGL2-превью: карты по отдельности или освещённая плоскость (GGX, нормаль DX), повтор 1–3, зум/пан.

const VS = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uD, uE, uN;
uniform vec2 uRes, uPan;
uniform float uZoom, uRep, uExp;
uniform int uMode, uGrid;
uniform vec3 uL;
out vec4 o;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float side = min(uRes.x, uRes.y) * uZoom;
  vec2 uv = (px - 0.5 * uRes) / side * uRep + 0.5 * uRep + uPan;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= uRep || uv.y >= uRep) {
    vec2 q = floor(px / 12.0);
    o = vec4(vec3(mod(q.x + q.y, 2.0) < 1.0 ? 0.11 : 0.13), 1.0);
    return;
  }
  vec3 d = texture(uD, uv).rgb, e = texture(uE, uv).rgb, n = texture(uN, uv).rgb;
  vec3 c;
  if (uMode == 1) c = d;
  else if (uMode == 2) c = e;
  else if (uMode == 3) c = n;
  else if (uMode == 4) c = vec3(e.g);
  else {
    vec3 alb = pow(d, vec3(2.2));
    vec3 N = normalize(n * 2.0 - 1.0);      // DX: ось Y вниз, как у картинки
    vec3 L = normalize(uL), V = vec3(0.0, 0.0, 1.0), H = normalize(L + V);
    float r = max(e.g, 0.04), m = step(0.5, e.b);
    float NdL = max(dot(N, L), 0.0), NdV = max(N.z, 1e-3), NdH = max(dot(N, H), 0.0), VdH = max(dot(V, H), 0.0);
    float a2 = r * r * r * r, dn = NdH * NdH * (a2 - 1.0) + 1.0, D = a2 / (3.14159 * dn * dn);
    float kk = (r + 1.0) * (r + 1.0) / 8.0, G = NdL / (NdL * (1.0 - kk) + kk) * NdV / (NdV * (1.0 - kk) + kk);
    vec3 F0 = mix(vec3(0.04), alb, m), F = F0 + (1.0 - F0) * pow(1.0 - VdH, 5.0);
    vec3 spec = D * G * F / (4.0 * NdL * NdV + 1e-4);
    vec3 kd = (1.0 - F) * (1.0 - m);
    c = (kd * alb / 3.14159 + spec) * NdL * 3.4 + alb * 0.10 * (0.6 + 0.4 * N.z) + alb * e.r * 2.0;
    c *= uExp;
    c = c / (1.0 + c);
    c = pow(c, vec3(1.0 / 2.2));
  }
  if (uGrid == 1) {
    vec2 f = abs(fract(uv + 0.5) - 0.5) / fwidth(uv);
    if (min(f.x, f.y) < 1.0) c = mix(c, vec3(1.0, 0.3, 0.2), 0.8);
  }
  o = vec4(c, 1.0);
}`;

export const VIEW_MODES = [
  [0, "Свет"], [1, "Diffuse"], [2, "ERM"], [3, "Normal DX"], [4, "Roughness"],
];

export class Viewer {
  constructor(canvas) {
    this.cv = canvas;
    const gl = (this.gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false }));
    if (!gl) throw new Error("WebGL2 недоступен");
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = (this.pr = gl.createProgram());
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    for (const n of ["uD", "uE", "uN", "uRes", "uPan", "uZoom", "uRep", "uExp", "uMode", "uGrid", "uL"]) this.u[n] = gl.getUniformLocation(pr, n);
    this.tex = [0, 1, 2].map(() => gl.createTexture());
    this.N = 0;
    this.mode = 0; this.rep = 2; this.zoom = 1; this.panX = 0; this.panY = 0;
    this.az = 135; this.el = 35; this.exposure = 1; this.grid = false;
    this.raf = 0;
  }

  setMaps(N, maps) {
    const gl = this.gl;
    [maps.diffuse, maps.erm, maps.normal].forEach((data, i) => {
      gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    });
    this.N = N;
    this.draw();
  }

  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    this.draw();
  }

  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this._draw(); });
  }

  _draw() {
    const gl = this.gl, u = this.u;
    gl.viewport(0, 0, this.cv.width, this.cv.height);
    gl.useProgram(this.pr);
    if (!this.N) { gl.clearColor(0.1, 0.1, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT); return; }
    this.tex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    gl.uniform1i(u.uD, 0); gl.uniform1i(u.uE, 1); gl.uniform1i(u.uN, 2);
    gl.uniform2f(u.uRes, this.cv.width, this.cv.height);
    gl.uniform2f(u.uPan, this.panX, this.panY);
    gl.uniform1f(u.uZoom, this.zoom);
    gl.uniform1f(u.uRep, this.rep);
    gl.uniform1f(u.uExp, this.exposure);
    gl.uniform1i(u.uMode, this.mode);
    gl.uniform1i(u.uGrid, this.grid ? 1 : 0);
    const az = (this.az * Math.PI) / 180, el = (this.el * Math.PI) / 180;
    gl.uniform3f(u.uL, Math.cos(el) * Math.cos(az), -Math.cos(el) * Math.sin(az), Math.sin(el));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  // экранная точка (CSS px) → uv в долях тайла [0, rep) или null вне плитки
  toUV(clientX, clientY) {
    const r = this.cv.getBoundingClientRect(), dpr = this.cv.width / r.width;
    const px = (clientX - r.left) * dpr, py = (clientY - r.top) * dpr;
    const side = Math.min(this.cv.width, this.cv.height) * this.zoom;
    const u = ((px - 0.5 * this.cv.width) / side) * this.rep + 0.5 * this.rep + this.panX;
    const v = ((py - 0.5 * this.cv.height) / side) * this.rep + 0.5 * this.rep + this.panY;
    if (u < 0 || v < 0 || u >= this.rep || v >= this.rep) return null;
    return { u, v };
  }

  zoomAt(clientX, clientY, factor) {
    const before = this.rawUV(clientX, clientY);
    this.zoom = Math.max(0.3, Math.min(64, this.zoom * factor));
    const after = this.rawUV(clientX, clientY);
    this.panX += before.u - after.u;
    this.panY += before.v - after.v;
    this.draw();
  }

  rawUV(clientX, clientY) {
    const r = this.cv.getBoundingClientRect(), dpr = this.cv.width / r.width;
    const side = Math.min(this.cv.width, this.cv.height) * this.zoom;
    return {
      u: (((clientX - r.left) * dpr - 0.5 * this.cv.width) / side) * this.rep + 0.5 * this.rep + this.panX,
      v: (((clientY - r.top) * dpr - 0.5 * this.cv.height) / side) * this.rep + 0.5 * this.rep + this.panY,
    };
  }

  panBy(dxCss, dyCss) {
    const r = this.cv.getBoundingClientRect(), dpr = this.cv.width / r.width;
    const side = Math.min(this.cv.width, this.cv.height) * this.zoom;
    this.panX -= ((dxCss * dpr) / side) * this.rep;
    this.panY -= ((dyCss * dpr) / side) * this.rep;
    this.draw();
  }

  resetView() { this.zoom = 1; this.panX = 0; this.panY = 0; this.draw(); }
}
