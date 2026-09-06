/* Visual editor formatting; article contents remain ordinary HTML. */
(function (root) {
  "use strict";
  const blockSelector = "p,h2,h3,h4,h5,h6,pre,blockquote,li,figcaption,td,th";
  function textParts(body, range) {
    const walker = body.ownerDocument.createTreeWalker(body, 4), parts = [];
    while (walker.nextNode()) {
      const node = walker.currentNode, parent = node.parentElement;
      if (parent.closest('[contenteditable="false"]') && !parent.closest("figcaption")) continue;
      if (!range.intersectsNode(node)) continue;
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (end > start) parts.push({ node, start, end });
    }
    return parts;
  }
  function blocks(body, range) {
    const element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    if (range.collapsed) {
      const block = element.closest(blockSelector);
      return block && body.contains(block) ? [block] : [];
    }
    const candidates = [...body.querySelectorAll(blockSelector)].filter((node) => range.intersectsNode(node) && textParts(node, range).length);
    return candidates.filter((node) => !candidates.some((child) => child !== node && node.contains(child)));
  }
  function styleText(body, range, styles) {
    const selected = [];
    for (const { node, start, end } of textParts(body, range)) {
      if (end < node.length) node.splitText(end);
      const text = start ? node.splitText(start) : node;
      const span = body.ownerDocument.createElement("span");
      Object.assign(span.style, styles); text.replaceWith(span); span.append(text); selected.push(text);
    }
    if (selected.length) {
      range.setStart(selected[0], 0); range.setEnd(selected.at(-1), selected.at(-1).length);
    }
    return range;
  }
  function mount({ body, $, on, edit, command, insertHtml, notify, clipboard }) {
    let painter = null, markerId = 0, typing = null;
    const pending = new Map();
    const sameCaret = (a, b) => a.collapsed && b.collapsed && a.startContainer === b.startContainer && a.startOffset === b.startOffset;
    function normalizeTyping() {
      for (const node of body.querySelectorAll("font[face],span[style]")) {
        const key = (node.getAttribute("face") || node.style.fontFamily).replaceAll('"', "").replaceAll("'", "");
        const styles = pending.get(key);
        if (!styles) continue;
        node.removeAttribute("face"); Object.assign(node.style, styles);
      }
    }
    function applyText(styles) {
      edit((range) => {
        if (!range.collapsed) { typing = null; return styleText(body, range, styles); }
        // Preserve the caret's native typing state without inserting placeholder text.
        const element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
        const marker = "blogTyping" + (++markerId);
        const merged = { fontFamily: getComputedStyle(element).fontFamily, ...(typing && sameCaret(range, typing.range) ? typing.styles : {}), ...styles };
        pending.set(marker, merged);
        document.execCommand("fontName", false, marker);
        normalizeTyping();
        typing = { range: getSelection().getRangeAt(0).cloneRange(), styles: merged };
        // Reinstalling even the same Range clears native pending typing styles.
        return undefined;
      });
    }
    function applyBlocks(callback) {
      edit((range) => {
        let selected = blocks(body, range);
        if (!selected.length) {
          document.execCommand("formatBlock", false, "p");
          range = getSelection().getRangeAt(0); selected = blocks(body, range);
        }
        selected.forEach(callback); return range;
      });
    }
    on("moreFormattingBtn", "click", () => {
      const open = $("moreFormatting").hidden;
      $("moreFormatting").hidden = !open; $("moreFormattingBtn").setAttribute("aria-expanded", String(open));
    });
    on("fontFamily", "change", () => applyText({ fontFamily: $("fontFamily").value || getComputedStyle(body).fontFamily }));
    const setSize = (value) => {
      if (!Number.isFinite(value) || value < 8 || value > 96) { $("fontSize").value = 12; notify("文字サイズは 8〜96 pt で指定してください。"); return; }
      $("fontSize").value = value; applyText({ fontSize: value + "pt" });
    };
    on("fontSize", "change", () => setSize(Number($("fontSize").value)));
    on("fontSize", "keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); setSize(Number($("fontSize").value)); } });
    const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 88, 96];
    on("growFontBtn", "click", () => setSize(sizes.find((size) => size > Number($("fontSize").value)) || 96));
    on("shrinkFontBtn", "click", () => setSize([...sizes].reverse().find((size) => size < Number($("fontSize").value)) || 8));
    on("fontColor", "change", () => {
      $("fontColor").parentElement.style.setProperty("--swatch", $("fontColor").value);
      applyText({ color: $("fontColor").value });
    });
    function highlight() {
      applyText({ backgroundColor: $("highlightColor").value });
      $("highlightBtn").style.setProperty("--marker-color", $("highlightColor").value);
    }
    on("highlightBtn", "click", highlight); on("highlightColor", "change", highlight);
    on("letterCase", "change", () => {
      const kind = $("letterCase").value; $("letterCase").value = "";
      if (!kind) return;
      edit((range) => {
        const parts = textParts(body, range);
        if (!parts.length) { notify("大文字・小文字を変更する文字を選択してください。"); return range; }
        // Keep links and inline formatting intact, including a word split across spans.
        const original = parts.map(({ node, start, end }) => node.data.slice(start, end)).join("");
        const converted = kind === "upper" ? original.replace(/[a-z]/g, (c) => c.toUpperCase()) : original.replace(/[A-Z]/g, (c) => c.toLowerCase());
        const result = kind === "title" ? converted.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : converted;
        let offset = 0;
        for (const { node, start, end } of parts) {
          node.replaceData(start, end - start, result.slice(offset, offset + end - start)); offset += end - start;
        }
        range.setStart(parts[0].node, parts[0].start); range.setEnd(parts.at(-1).node, parts.at(-1).end); return range;
      });
    });
    on("lineSpacing", "change", () => {
      const value = $("lineSpacing").value; if (value) applyBlocks((node) => { node.style.lineHeight = value; });
    });
    on("paragraphColor", "change", () => {
      $("paragraphColor").parentElement.style.setProperty("--swatch", $("paragraphColor").value);
      applyBlocks((node) => { node.style.backgroundColor = $("paragraphColor").value; });
    });
    on("paragraphBorder", "change", () => {
      const value = $("paragraphBorder").value; if (!value) return;
      applyBlocks((node) => {
        node.style.border = value === "all" ? "1px solid #8795a5" : "none";
        if (value === "bottom") node.style.borderBottom = "1px solid #8795a5";
      });
    });
    for (const [id, delta] of [["indentBtn", 24], ["outdentBtn", -24]]) on(id, "click", () => {
      edit((range) => {
        const selected = blocks(body, range);
        if (selected.some((node) => node.closest("li"))) document.execCommand(delta > 0 ? "indent" : "outdent", false, null);
        else {
          if (!selected.length) { document.execCommand("formatBlock", false, "p"); range = getSelection().getRangeAt(0); }
          blocks(body, range).forEach((node) => { node.style.marginLeft = Math.max(0, Math.min(144, (parseFloat(node.style.marginLeft) || 0) + delta)) + "px"; });
        }
        return getSelection().getRangeAt(0);
      });
    });
    on("listStyle", "change", () => {
      const value = $("listStyle").value; if (!value) return;
      const tag = ["disc", "circle", "square"].includes(value) ? "ul" : "ol";
      edit((range) => {
        let selected = blocks(body, range);
        if (!selected.length || selected.some((node) => !node.closest(tag))) {
          document.execCommand(tag === "ul" ? "insertUnorderedList" : "insertOrderedList", false, null);
          range = getSelection().getRangeAt(0); selected = blocks(body, range);
        }
        selected.forEach((node) => { const list = node.closest(tag); if (list) list.style.listStyleType = value; }); return range;
      });
    });
    on("sortParagraphsBtn", "click", () => edit((range) => {
      const selected = blocks(body, range);
      if (selected.length < 2 || !selected.every((node) => node.parentNode === selected[0].parentNode)) {
        notify("同じ階層の段落、または箇条書きを2つ以上選択してください。"); return range;
      }
      const slots = selected.map((node) => { const slot = document.createComment(""); node.before(slot); return slot; });
      const sorted = [...selected].sort((a, b) => a.textContent.localeCompare(b.textContent, "ja", { numeric: true }));
      sorted.forEach((node, index) => slots[index].replaceWith(node));
      range.setStartBefore(sorted[0]); range.setEndAfter(sorted.at(-1)); return range;
    }));
    on("showMarksBtn", "click", () => $("showMarksBtn").setAttribute("aria-pressed", String(body.classList.toggle("show-marks"))));
    document.querySelectorAll("[data-block]").forEach((button) => button.addEventListener("click", () => command("formatBlock", button.dataset.block)));
    for (const action of ["Paste", "Cut", "Copy"]) on("ribbon" + action + "Btn", "click", () => clipboard(action.toLowerCase(), true));
    const painterProps = ["fontFamily", "fontSize", "fontWeight", "fontStyle", "textDecoration", "color", "backgroundColor", "verticalAlign"];
    function cancelPainter() { painter = null; $("formatPainterBtn").setAttribute("aria-pressed", "false"); body.classList.remove("format-painting"); }
    on("formatPainterBtn", "click", () => {
      if (painter) { cancelPainter(); return; }
      edit((range) => {
        const element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
        const style = getComputedStyle(element);
        painter = Object.fromEntries(painterProps.map((prop) => [prop, style[prop]])); return range;
      }, false);
      $("formatPainterBtn").setAttribute("aria-pressed", "true"); body.classList.add("format-painting");
      $("moreFormatting").hidden = true; $("moreFormattingBtn").setAttribute("aria-expanded", "false");
      notify("書式を適用する文字を選択してください。Escで解除できます。");
    });
    function paintSelection() {
      if (!painter || getSelection().isCollapsed || !body.contains(getSelection().anchorNode)) return;
      const styles = painter; cancelPainter(); applyText(styles);
    }
    on("body", "pointerup", paintSelection);
    on("body", "keyup", (event) => { if (event.shiftKey) paintSelection(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && painter) { event.preventDefault(); event.stopImmediatePropagation(); cancelPainter(); } }, true);
    on("insertTableBtn", "click", () => { $("tableDialog").showModal(); $("tableColumns").focus(); });
    on("tableForm", "submit", (event) => {
      event.preventDefault();
      const columns = Number($("tableColumns").value), rows = Number($("tableRows").value);
      if (![columns, rows].every((n) => Number.isInteger(n) && n >= 1 && n <= 12)) return;
      const row = (tag) => "<tr>" + Array.from({ length: columns }, () => "<" + tag + (tag === "th" ? ' scope="col"' : "") + "><p><br></p></" + tag + ">").join("") + "</tr>";
      const header = $("tableHeader").checked;
      $("tableDialog").close();
      insertHtml("<table>" + (header ? "<thead>" + row("th") + "</thead>" : "") + "<tbody>" + Array.from({ length: rows }, () => row("td")).join("") + "</tbody></table><p><br></p>", true);
    });
    function state(node, range) {
      const style = getComputedStyle(node);
      if (typing && !sameCaret(range, typing.range)) typing = null;
      const fontSize = typing?.styles.fontSize || style.fontSize;
      if (document.activeElement !== $("fontSize")) $("fontSize").value = Math.round(parseFloat(fontSize) * (fontSize.endsWith("pt") ? 1 : .75)) || 12;
      if (document.activeElement !== $("fontFamily")) {
        const family = (typing?.styles.fontFamily || style.fontFamily).split(",")[0].replace(/['"]/g, "").trim().toLowerCase();
        $("fontFamily").value = [...$("fontFamily").options].find((option) => option.value.split(",")[0].replace(/['"]/g, "").trim().toLowerCase() === family)?.value || "";
      }
      $("ribbonCutBtn").disabled = $("ribbonCopyBtn").disabled = !range || range.collapsed;
      const block = node.closest(blockSelector);
      if (document.activeElement !== $("lineSpacing")) $("lineSpacing").value = block?.style.lineHeight || "";
      document.querySelectorAll("[data-block]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.block === (block?.localName || "p"))));
    }
    return { normalizeTyping, state, applyText, resetTyping: () => { typing = null; }, align: (value) => applyBlocks((node) => { node.style.textAlign = value; }) };
  }
  root.BlogEditorFormatting = { mount, textParts, blocks, styleText };
})(typeof window !== "undefined" ? window : globalThis);
