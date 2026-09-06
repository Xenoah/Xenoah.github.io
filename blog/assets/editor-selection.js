/* Keep the editing target visible while a toolbar control owns focus. */
(function (root) {
  "use strict";
  function create(body, container) {
    const registry = root.CSS?.highlights, name = "blog-editor-selection";
    const custom = registry && typeof root.Highlight === "function";
    let range = null, frame = null;
    const overlay = body.ownerDocument.createElement("div");
    overlay.className = "editor-selection-overlay"; overlay.setAttribute("aria-hidden", "true");
    overlay.hidden = true; container.append(overlay);
    function clear() {
      range = null; if (custom) registry.delete(name);
      overlay.replaceChildren(); overlay.hidden = true;
    }
    function draw() {
      frame = null;
      if (!range || range.collapsed || !body.contains(range.commonAncestorContainer)) { clear(); return; }
      if (custom) { registry.set(name, new root.Highlight(range)); return; }
      // Older browsers paint outside the manuscript, so exports and undo stay untouched.
      overlay.replaceChildren(); overlay.hidden = false;
      const bounds = body.getBoundingClientRect(), seen = new Set();
      for (const rect of range.getClientRects?.() || []) {
        const left = Math.max(rect.left, bounds.left, 0), top = Math.max(rect.top, bounds.top, 0);
        const right = Math.min(rect.right, bounds.right, root.innerWidth), bottom = Math.min(rect.bottom, bounds.bottom, root.innerHeight);
        const key = [left, top, right, bottom].join(",");
        if (right <= left || bottom <= top || seen.has(key)) continue;
        seen.add(key);
        const mark = body.ownerDocument.createElement("span");
        Object.assign(mark.style, { left: left + "px", top: top + "px", width: right - left + "px", height: bottom - top + "px" });
        overlay.append(mark);
      }
    }
    const schedule = () => { if (range && !custom && frame == null) frame = root.requestAnimationFrame(draw); };
    body.ownerDocument.addEventListener("scroll", schedule, true);
    root.addEventListener("resize", schedule);
    if (root.ResizeObserver) new root.ResizeObserver(schedule).observe(body);
    return { show(next) { range = next?.cloneRange() || null; draw(); }, clear };
  }
  root.BlogEditorSelection = { create };
})(typeof window !== "undefined" ? window : globalThis);
