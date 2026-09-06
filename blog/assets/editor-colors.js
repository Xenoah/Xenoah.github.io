/* Split color buttons share one palette; choosing a color is an explicit edit. */
(function (root) {
  "use strict";
  const storageKey = "xenoah_blog_editor_colors_v1";
  const textColors = [
    "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#eeeeee", "#ffffff",
    "#c42b37", "#e67e22", "#f1c40f", "#27ae60", "#16a085", "#2980b9", "#8e44ad", "#c23d85",
    "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#cfe2f3", "#d9d2e9", "#ead1dc",
    "#660000", "#783f04", "#7f6000", "#274e13", "#0c343d", "#073763", "#351c75", "#741b47"
  ];
  const markerColors = [
    "#fff0a8", "#ffdd88", "#ffd6a5", "#ffadad", "#ffc6ff", "#d8c4ff", "#bde0fe", "#a0e7e5",
    "#fdffb6", "#e9f5a1", "#caffbf", "#b7e4c7", "#ffff00", "#00ff00", "#00ffff", "#ff99cc"
  ];
  function normalize(value) {
    const color = String(value || "").trim().toLowerCase();
    if (/^#[\da-f]{6}$/.test(color)) return color;
    if (/^#[\da-f]{3}$/.test(color)) return "#" + [...color.slice(1)].map((c) => c + c).join("");
    return null;
  }
  function mount({ $, on, applyText, cancel }) {
    const kinds = {
      font: { title: "文字色", color: "#c42b37", property: "color", button: $("fontColorBtn"), menu: $("fontColorMenuBtn"), swatches: textColors },
      highlight: { title: "マーカー色", color: "#fff0a8", property: "backgroundColor", button: $("highlightBtn"), menu: $("highlightColorMenuBtn"), swatches: markerColors }
    };
    const palette = $("colorPalette");
    let active = null;
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      for (const [key, kind] of Object.entries(kinds)) kind.color = normalize(saved?.[key]) || kind.color;
    } catch { /* Color preferences are optional when browser storage is unavailable. */ }
    function updateButton(kind) {
      kind.button.style.setProperty("--swatch", kind.color);
      kind.button.style.setProperty("--marker-color", kind.color);
      kind.button.title = "前回の" + kind.title + "を適用（" + kind.color + "）";
    }
    function close() {
      palette.hidden = true; active = null;
      for (const kind of Object.values(kinds)) kind.menu.setAttribute("aria-expanded", "false");
    }
    function apply(key, color = kinds[key].color) {
      const kind = kinds[key];
      // Always apply, even if the chosen color has not changed since the last edit.
      if (!applyText({ [kind.property]: color })) return;
      kind.color = color; updateButton(kind); close();
      try { localStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(Object.entries(kinds).map(([name, value]) => [name, value.color])))); } catch { /* Keep session preferences. */ }
    }
    function position() {
      if (!active) return;
      const anchor = kinds[active].menu.getBoundingClientRect();
      const width = document.documentElement.clientWidth || innerWidth;
      const height = document.documentElement.clientHeight || innerHeight;
      palette.style.maxHeight = Math.max(80, height - 16) + "px";
      const box = palette.getBoundingClientRect();
      palette.style.left = Math.max(8, Math.min(anchor.right - box.width, width - box.width - 8)) + "px";
      const below = anchor.bottom + 6;
      const top = below + box.height <= height - 8 ? below : Math.max(8, anchor.top - box.height - 6);
      palette.style.top = Math.min(top, Math.max(8, height - box.height - 8)) + "px";
    }
    function open(key) {
      if (active === key) { cancel(); return; }
      close(); active = key;
      const kind = kinds[key];
      $("colorPaletteTitle").textContent = kind.title;
      $("colorHex").value = $("colorCustom").value = kind.color;
      $("colorError").hidden = true; $("colorHex").removeAttribute("aria-invalid");
      $("colorSwatches").replaceChildren(...kind.swatches.map((color) => {
        const button = document.createElement("button");
        button.type = "button"; button.className = "color-swatch"; button.dataset.color = color;
        button.style.setProperty("--color", color);
        button.title = color; button.setAttribute("aria-label", kind.title + " " + color);
        button.setAttribute("aria-pressed", String(color === kind.color));
        button.addEventListener("click", () => apply(key, color));
        return button;
      }));
      palette.hidden = false; kind.menu.setAttribute("aria-expanded", "true"); position();
      (palette.querySelector('[aria-pressed="true"]') || $("colorSwatches").firstElementChild).focus({ preventScroll: true });
    }
    for (const [key, kind] of Object.entries(kinds)) {
      updateButton(kind);
      on(kind.button.id, "click", () => apply(key));
      on(kind.menu.id, "click", () => open(key));
      for (const button of [kind.button, kind.menu]) on(button.id, "keydown", (event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); if (active !== key) open(key); }
      });
    }
    function customColor() {
      if (!active) return;
      const color = normalize($("colorHex").value);
      $("colorError").hidden = !!color;
      $("colorHex").setAttribute("aria-invalid", String(!color));
      if (!color) { $("colorHex").focus(); position(); return; }
      apply(active, color);
    }
    // Native pickers may emit several events, or none for the same color. They only
    // update the palette; the Apply button commits to the original manuscript range.
    for (const event of ["input", "change"]) on("colorCustom", event, () => { $("colorHex").value = $("colorCustom").value; });
    on("colorHex", "input", () => {
      const color = normalize($("colorHex").value);
      if (color) $("colorCustom").value = color;
      $("colorError").hidden = true; $("colorHex").removeAttribute("aria-invalid");
    });
    on("colorHex", "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); customColor(); } });
    on("applyCustomColorBtn", "click", customColor);
    on("closeColorPaletteBtn", "click", cancel);
    on("colorSwatches", "keydown", (event) => {
      const buttons = [...$("colorSwatches").children], index = buttons.indexOf(document.activeElement);
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -8, ArrowDown: 8 };
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : index + steps[event.key];
      if (index < 0 || !Number.isFinite(next)) return;
      event.preventDefault(); buttons[(next + buttons.length) % buttons.length].focus({ preventScroll: true });
    });
    document.addEventListener("pointerdown", (event) => {
      if (!palette.contains(event.target) && !Object.values(kinds).some((kind) => kind.button.contains(event.target) || kind.menu.contains(event.target))) close();
    });
    document.addEventListener("focusin", (event) => {
      if (!palette.contains(event.target) && !Object.values(kinds).some((kind) => kind.button.contains(event.target) || kind.menu.contains(event.target))) close();
    });
    document.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return { close, apply };
  }
  root.BlogEditorColors = { mount };
})(typeof window !== "undefined" ? window : globalThis);
