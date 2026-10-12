// Перетягивание числовых полей (как в Blender / Substance): зажать поле и тянуть вверх-вниз или вбок.
// 1 шаг (step) на 4 px; Shift — точнее (×0.1), Ctrl / Alt — грубее (×10). Щелчок без движения — обычный ввод,
// стрелки поля работают как раньше. Изменения идут событиями input (по ходу) и change (в конце).
(function () {
  "use strict";
  const PX_PER_STEP = 4, SPIN_W = 18, THRESHOLD = 3;
  const decimals = (s) => { const t = String(s); const i = t.indexOf("."); return i < 0 ? 0 : t.length - i - 1; };

  document.addEventListener("pointerdown", (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement) || inp.type !== "number" || inp.disabled || inp.readOnly) return;
    if (e.button !== 0 || document.activeElement === inp) return; // уже редактируется — не мешаем
    if (e.offsetX > inp.clientWidth - SPIN_W) return;             // стрелки поля
    e.preventDefault();
    const step = +inp.step > 0 ? +inp.step : 1;
    const min = inp.min !== "" ? +inp.min : -Infinity, max = inp.max !== "" ? +inp.max : Infinity;
    const dec = Math.max(decimals(inp.step || 1), decimals(inp.value));
    const x0 = e.clientX, y0 = e.clientY;
    let lastX = x0, lastY = y0, acc = 0, scrub = false;
    try { inp.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }

    const move = (ev) => {
      if (!scrub) {
        if (Math.abs(ev.clientX - x0) + Math.abs(ev.clientY - y0) < THRESHOLD) return;
        scrub = true;
        document.documentElement.classList.add("scrubbing");
      }
      const fine = ev.shiftKey, mul = fine ? 0.1 : ev.ctrlKey || ev.altKey ? 10 : 1;
      acc += ((ev.clientX - lastX) + (lastY - ev.clientY)) / PX_PER_STEP * step * mul; // вверх / вправо — больше
      lastX = ev.clientX; lastY = ev.clientY;
      const cur = +inp.value || 0, target = cur + acc, q = fine ? step / 10 : step;
      let v = +(Math.round(target / q) * q).toFixed(dec + (fine ? 1 : 0)); // по сетке шага
      if (v >= max || v <= min) { v = Math.min(max, Math.max(min, v)); acc = 0; } // упёрлись — без «запаса» за границей
      else acc = target - v; // остаток копится, ничего не теряется на округлении
      if (v !== cur) {
        inp.value = v;
        inp.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    const up = () => {
      inp.removeEventListener("pointermove", move);
      inp.removeEventListener("pointerup", up);
      inp.removeEventListener("pointercancel", up);
      document.documentElement.classList.remove("scrubbing");
      if (scrub) inp.dispatchEvent(new Event("change", { bubbles: true }));
      else { inp.focus(); inp.select(); } // щелчок без движения — ввод с клавиатуры
    };
    inp.addEventListener("pointermove", move);
    inp.addEventListener("pointerup", up);
    inp.addEventListener("pointercancel", up);
  });
})();
