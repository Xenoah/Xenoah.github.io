/* 依存ライブラリ・通信なしで動くビジュアル記事エディター。 */
(function () {
  "use strict";
  const C = window.BlogEditorCore, esc = C.escapeHtml;
  // 取り込んだ記事内のidと操作UIのidが重なっても、参照先を変えない。
  const elements = Object.fromEntries(Array.from(document.querySelectorAll("#editorApp, #editorApp [id]")).map((element) => [element.id, element]));
  const $ = (id) => elements[id];
  const body = $("body"), app = $("editorApp");
  const selectionPaint = window.BlogEditorSelection.create(body, app);
  let selectionPinned = false;
  function releaseSelection() { selectionPinned = false; selectionPaint.clear(); }
  function pinSelection(event) {
    if (selectionPinned) return;
    if (event?.type !== "focusin") captureRange();
    selectionPinned = true;
    selectionPaint.show(savedRange);
  }
  const fieldNames = ["title", "date", "slug", "description", "tags", "image", "title_en", "description_en"];
  const fields = Object.fromEntries(fieldNames.map((key) => [key, $(key)]));
  const legacyKey = "xenoah_blog_editor_draft_html_v1";
  const backupKey = "xenoah_blog_editor_draft_visual_v2";
  let assets = [], extra = {}, mode = "visual", previewing = false, ready = false, composing = false;
  let savedRange = null, selectedMedia = null, linkNode = null, insertKind = "link";
  let saveTimer, historyTimer, statusTimer, revision = 0, savedRevision = 0, saveQueue = Promise.resolve();
  let history = [], historyIndex = -1;
  fields.date.value = C.localDate();

  function notify(message) {
    $("appStatus").textContent = message;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { $("appStatus").textContent = ""; }, 6000);
  }
  function saveState(text, state = "") {
    $("draftSaved").textContent = text;
    $("draftSaved").dataset.state = state;
  }
  const metadata = () => ({ ...extra, ...Object.fromEntries(fieldNames.map((key) => [key, fields[key].value])) });
  const assetPath = (asset) => C.folderPath(metadata()) + encodeURIComponent(asset.name);
  function normalizePath(value) {
    try {
      return decodeURIComponent(String(value || "").replace(/^https:\/\/xenoah\.github\.io/, "").replace(/^\.\//, ""));
    } catch { return String(value || ""); }
  }
  function findAsset(value) {
    const path = normalizePath(value);
    return assets.find((asset) => asset.url === value || normalizePath(assetPath(asset)) === path || asset.aliases.some((alias) => normalizePath(alias) === path));
  }
  function rememberPaths() {
    assets.forEach((asset) => {
      const path = assetPath(asset);
      if (!asset.aliases.includes(path)) asset.aliases.push(path);
    });
  }
  function mapMedia(container, local) {
    container.querySelectorAll("[src], [poster], [style]").forEach((node) => {
      for (const attr of ["src", "poster"]) {
        const asset = findAsset(node.getAttribute(attr));
        if (asset) {
          node.setAttribute(attr, local ? asset.url : assetPath(asset));
          if (node.localName === "img" && asset.width && asset.height) {
            node.setAttribute("width", asset.width); node.setAttribute("height", asset.height);
          }
        }
      }
      const background = node.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      const asset = background && findAsset(background);
      if (asset) node.style.backgroundImage = `url("${local ? asset.url : assetPath(asset)}")`;
    });
  }
  function getBody() {
    // HTMLモードの入力は必ず不活性なDOMParserで除染してから扱う。
    // ビジュアル側はcloneを使い、表示中のBlob URLを失わず公開パスへ戻す。
    const container = mode === "html" ? document.createElement("div") : body.cloneNode(true);
    if (mode === "html") container.innerHTML = C.sanitize($("htmlSource").value);
    mapMedia(container, false);
    return C.sanitize(container.innerHTML);
  }
  function prepareBody() {
    mapMedia(body, true);
    body.querySelectorAll("[id]").forEach((node) => {
      if (elements[node.id]) node.removeAttribute("id");
    });
    body.querySelectorAll("figure").forEach((figure) => {
      figure.contentEditable = "false";
      const caption = figure.querySelector("figcaption");
      if (caption) { caption.contentEditable = "true"; caption.tabIndex = 0; caption.setAttribute("aria-label", "画像のキャプション"); }
    });
    body.querySelectorAll(".embed").forEach((node) => {
      node.contentEditable = "false";
      node.tabIndex = 0;
      node.setAttribute("aria-label", "動画。Deleteキーで削除");
    });
  }
  function setBody(html) {
    releaseSelection();
    formatting?.resetTyping();
    closeMedia();
    body.innerHTML = C.sanitize(html) || "<p><br></p>";
    prepareBody();
    savedRange = null;
  }
  function dataSnapshot(includeFiles = true) {
    const data = { ...metadata(), body: getBody(), savedAt: new Date().toISOString(), version: 3, draftId };
    data.assets = assets.map(({ id, name, file, aliases, width, height, originalSize }) => ({ id, name, width, height, originalSize, aliases: [...aliases], ...(includeFiles ? { file } : {}) }));
    return data;
  }
  function growTitle() {
    fields.title.style.height = "auto";
    fields.title.style.height = Math.max(56, fields.title.scrollHeight) + "px";
  }
  function refresh() {
    const html = getBody(), data = metadata(), cover = C.safeUrl(data.image, true);
    const coverAsset = findAsset(cover);
    if (coverAsset) fields.image.value = assetPath(coverAsset);
    rememberPaths();
    body.dataset.empty = String(!C.textFromHtml(html) && !/<(?:img|iframe|video|hr|table)\b/i.test(html));
    const characters = Array.from(C.textFromHtml(html)).length;
    $("charCount").textContent = characters.toLocaleString();
    $("readTime").textContent = Math.max(1, Math.ceil(characters / 600));
    $("imageCount").textContent = assets.length;
    $("descriptionCount").textContent = `${Array.from(data.description).length} / 160`;
    $("permalinkPreview").textContent = C.permalink(data);
    $("postPath").textContent = C.folderPath(data).slice(1) + "index.html";
    $("coverArea").classList.toggle("has-cover", !!cover);
    $("coverPreview").hidden = !cover;
    $("removeCoverBtn").hidden = !cover;
    if (cover) {
      const src = coverAsset?.url || cover;
      if ($("coverPreview").getAttribute("src") !== src) $("coverPreview").src = src;
    } else $("coverPreview").removeAttribute("src");
    const doc = new DOMParser().parseFromString(html, "text/html");
    $("outline").innerHTML = Array.from(doc.querySelectorAll("h2,h3")).map((heading, index) =>
      `<button type="button" data-heading="${index}" class="${heading.localName === "h3" ? "subheading" : ""}">${esc(heading.textContent || "無題の見出し")}</button>`
    ).join("") || '<p class="writing-hint">見出しを追加すると、ここに目次ができます。</p>';
    if (previewing) renderPreview();
    if ($("exportDialog").open) renderChecklist();
    growTitle();
  }
  function renderPreview() {
    const data = metadata(), cover = C.safeUrl(data.image, true);
    $("preview").innerHTML = `<article class="article"><header class="article-head">
      <p class="article-kicker">${esc(data.date.replaceAll("-", "."))}</p>
      <h1>${esc(data.title || "無題の記事")}</h1>
      ${data.description ? `<p class="article-lead">${esc(data.description)}</p>` : ""}
      <div class="tag-row">${data.tags.split(/[,、]/).map((tag) => tag.trim()).filter(Boolean).map((tag) => `<span>${esc(tag)}</span>`).join("")}</div>
      </header>${cover ? `<figure class="eyecatch"><img src="${esc(cover)}" alt=""></figure>` : ""}
      <div class="article-body">${getBody()}</div></article>`;
    mapMedia($("preview"), true);
  }
  function changed(immediate = false) {
    if (!ready || composing) return;
    revision++;
    refresh();
    saveState("保存中…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(), 700);
    clearTimeout(historyTimer);
    if (immediate) recordHistory(); else historyTimer = setTimeout(recordHistory, 400);
  }

  const draftStore = new window.BlogDraftStore();
  let draftId = crypto.randomUUID(), draftSequence = 0;
  async function readStored() {
    const record = await draftStore.current();
    if (!record) return null;
    draftId = record.id; draftSequence = record.seq;
    return record.data;
  }
  async function writeStored(data, checkpoint) {
    try {
      const record = await draftStore.save(draftId, data, draftSequence, checkpoint);
      draftSequence = record.seq;
    } catch (error) {
      if (error.name !== "DraftConflictError") throw error;
      draftId = crypto.randomUUID(); draftSequence = 0;
      const record = await draftStore.save(draftId, data, 0);
      draftSequence = record.seq;
      notify("別のタブの更新を保護するため、今の原稿を別の下書きとして保存しました。");
      return true;
    }
  }
  function saveDraft(showMessage = false) {
    if (!ready || composing) return Promise.resolve();
    clearTimeout(saveTimer);
    const data = dataSnapshot(), currentRevision = revision;
    saveQueue = saveQueue.catch(() => {}).then(async () => {
      try {
        const forked = await writeStored(data, showMessage);
        try { localStorage.removeItem(backupKey); } catch { /* IndexedDB is sufficient */ }
        savedRevision = currentRevision;
        if (revision === currentRevision) saveState(`保存済み ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`);
        if (showMessage && !forked) notify("本文と画像を下書きに保存しました。");
        return true;
      } catch {
        let backedUp = false;
        try {
          const fallback = { ...data, assets: data.assets.map(({ file, ...rest }) => rest) };
          localStorage.setItem(backupKey, JSON.stringify(fallback));
          backedUp = true;
          if (!assets.length) savedRevision = currentRevision;
        } catch { /* Storage can be disabled or full. Never claim success. */ }
        saveState(backedUp ? (assets.length ? "本文のみ保存・画像はZIPへ" : "本文を保存済み") : "保存できません・ZIPで保存", assets.length || !backedUp ? "error" : "");
        if (showMessage || assets.length || !backedUp) notify(backedUp ? "本文を保存しました。画像の保存ができないため、画像込みZIPをダウンロードしてください。" : "下書きを保存できません。記事をZIPでダウンロードしてください。");
      }
      return false;
    });
    return saveQueue;
  }
  async function restoreDraft() {
    let stored, fallback, legacy;
    try { stored = await readStored(); } catch { /* A text backup can still be restored. */ }
    try { fallback = JSON.parse(localStorage.getItem(backupKey) || "null"); } catch { /* Invalid backups don't stop the editor. */ }
    try { legacy = JSON.parse(localStorage.getItem(legacyKey) || "null"); } catch { /* Keep invalid legacy data untouched. */ }
    const data = fallback && (!stored || fallback.savedAt > stored.savedAt) ? fallback : stored || legacy;
    if (!data || typeof data.body !== "string") return false;
    if (data !== stored) { draftId = crypto.randomUUID(); draftSequence = 0; }
    const restored = [];
    for (const asset of data.assets || []) {
      const file = asset.file || stored?.assets?.find((item) => item.id === asset.id)?.file;
      if (file instanceof Blob && typeof asset.name === "string") {
        restored.push({ ...asset, file, aliases: Array.isArray(asset.aliases) ? asset.aliases : [], url: URL.createObjectURL(file) });
      }
    }
    assets = restored;
    applyData(data);
    if ((data.assets || []).length > restored.length) {
      saveState("本文を復元・画像は選び直し", "error");
      notify("本文を復元しました。保存できなかった画像は再度追加してください。");
    } else saveState("前回の下書きを復元しました");
    renderAssets();
    return true;
  }
  function applyData(data) {
    for (const key of fieldNames) fields[key].value = typeof data[key] === "string" ? data[key] : "";
    fields.date.value ||= C.localDate();
    fields.slug.value ||= "new-article";
    fields.slug.dataset.touched = "true";
    extra = Object.fromEntries(["author", "robots", "last_modified_at", "originalPermalink"].filter((key) => typeof data[key] === "string").map((key) => [key, data[key]]));
    if (!extra.originalPermalink && data.permalink) extra.originalPermalink = new URL(data.permalink, location.href).pathname;
    mode = "visual";
    previewing = false;
    setBody(data.body);
    updatePanels();
    refresh();
  }

  async function retainCurrent() {
    if (composing) throw new Error("文字の変換を確定してから切り替えてください。");
    if (!fields.title.value.trim() && !C.textFromHtml(getBody()) && !assets.length) return;
    app.inert = true;
    try {
      if (!await saveDraft(true)) throw new Error("現在の下書きを保存できません。ZIPで保存してから切り替えてください。");
    } finally { app.inert = false; }
  }
  function loadDocument(data, id = crypto.randomUUID(), seq = 0) {
    clearTimeout(saveTimer); clearTimeout(historyTimer);
    assets.forEach((asset) => URL.revokeObjectURL(asset.url));
    assets = (data.assets || []).filter((asset) => asset.file instanceof Blob).map((asset) =>
      ({ ...asset, aliases: asset.aliases || [], url: URL.createObjectURL(asset.file) }));
    draftId = id; draftSequence = seq;
    applyData(data); renderAssets(); history = []; historyIndex = -1; recordHistory();
    revision++; savedRevision = seq ? revision : revision - 1;
  }
  async function showDrafts() {
    $("draftStatus").textContent = "";
    $("draftsDialog").showModal();
    try {
      await retainCurrent();
      const list = await draftStore.list();
      $("draftList").innerHTML = list.map((item) => `<section class="draft-entry">
        <button class="writing-button" type="button" data-draft="${esc(item.id)}">${esc(item.data.title || "無題の記事")}${item.id === draftId ? "（編集中）" : ""}
        <small>${esc(new Date(item.data.savedAt).toLocaleString("ja-JP"))}</small></button>
        ${item.history.length ? `<details><summary>保存履歴（${item.history.length}件）</summary>${[...item.history].reverse().map((entry) =>
          `<button class="writing-button quiet" type="button" data-draft="${esc(item.id)}" data-version="${entry.seq}">${esc(new Date(entry.data.savedAt).toLocaleString("ja-JP"))} を復元</button>`).join("")}</details>` : ""}</section>`).join("") || '<p class="writing-hint">下書きはまだありません。</p>';
    } catch (error) { $("draftStatus").textContent = error.message; }
  }

  // ブラウザの選択範囲を保持し、ツールバーやダイアログの操作後も挿入位置を維持。
  function captureRange() {
    if (selectionPinned) return;
    const selection = window.getSelection();
    if (selection.rangeCount && body.contains(selection.getRangeAt(0).commonAncestorContainer)) savedRange = selection.getRangeAt(0).cloneRange();
  }
  function restoreRange() {
    releaseSelection();
    body.focus();
    const selection = window.getSelection();
    if (!savedRange || !body.contains(savedRange.commonAncestorContainer)) {
      savedRange = document.createRange();
      savedRange.selectNodeContents(body);
      savedRange.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(savedRange);
    return savedRange;
  }
  function bookmark() {
    const selection = window.getSelection();
    if (!selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!body.contains(range.commonAncestorContainer)) return null;
    const path = (node) => {
      const result = [];
      while (node !== body) { result.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node)); node = node.parentNode; }
      return result;
    };
    return { start: path(range.startContainer), startOffset: range.startOffset, end: path(range.endContainer), endOffset: range.endOffset };
  }
  function restoreBookmark(mark) {
    if (!mark) return;
    try {
      const nodeAt = (path) => path.reduce((node, index) => node.childNodes[index], body);
      const range = document.createRange();
      range.setStart(nodeAt(mark.start), mark.startOffset);
      range.setEnd(nodeAt(mark.end), mark.endOffset);
      savedRange = range; restoreRange();
    } catch { savedRange = null; }
  }
  function recordHistory() {
    if (composing) return;
    clearTimeout(historyTimer);
    const html = getBody(), selection = bookmark();
    if (history[historyIndex]?.html === html) { history[historyIndex].selection = selection; return; }
    history = history.slice(0, historyIndex + 1);
    history.push({ html, selection });
    if (history.length > 100) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }
  function updateHistoryButtons() {
    $("undoBtn").disabled = historyIndex < 1;
    $("redoBtn").disabled = historyIndex >= history.length - 1;
  }
  function undoRedo(direction) {
    recordHistory();
    const next = historyIndex + direction;
    if (next < 0 || next >= history.length) return;
    formatting?.resetTyping();
    historyIndex = next;
    const entry = history[historyIndex];
    if (mode === "html") $("htmlSource").value = entry.html; else { setBody(entry.html); restoreBookmark(entry.selection); }
    revision++; refresh(); updateHistoryButtons();
    saveState("保存中…"); clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDraft(), 700);
  }
  function command(name, value = null) {
    if (mode !== "visual" || previewing) return;
    const alignment = { justifyLeft: "left", justifyCenter: "center", justifyRight: "right", justifyFull: "justify" }[name];
    if (alignment) { formatting.align(alignment); return; }
    if (name === "removeFormat") formatting.resetTyping();
    recordHistory(); restoreRange();
    // ネイティブの編集命令を使用。履歴は画像の挿入・削除も含めてアプリ側で統一。
    document.execCommand(name, false, value);
    captureRange(); prepareBody(); changed(true); toolbarState();
  }
  function insertHtml(html, block = false) {
    recordHistory();
    if (mode === "html") {
      const source = $("htmlSource");
      source.setRangeText(C.sanitize(html), source.selectionStart, source.selectionEnd, "end");
      changed(true); return;
    }
    const range = restoreRange();
    const fragment = range.createContextualFragment(C.sanitize(html));
    if (block) {
      const node = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
      const locked = node.closest("figure,.embed");
      if (locked && body.contains(locked)) {
        range.setStartAfter(locked); range.collapse(true);
      }
    }
    // insertHTML は段落を分割してブロックを挿入できる（Range.insertNodeだけではpが入れ子になる）。
    const holder = document.createElement("div"); holder.append(fragment);
    document.execCommand("insertHTML", false, holder.innerHTML);
    prepareBody(); captureRange(); changed(true);
  }
  let formatting;
  function toolbarState() {
    const selection = window.getSelection();
    if (!selection.rangeCount || !body.contains(selection.anchorNode)) return;
    document.querySelectorAll("[data-command][aria-pressed]").forEach((button) => {
      button.setAttribute("aria-pressed", String(document.queryCommandState(button.dataset.command)));
    });
    const node = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
    const block = node.closest("h2,h3,blockquote,pre,p");
    $("blockFormat").value = block?.localName || "p";
    formatting?.state(node, selection.getRangeAt(0));
  }
  function updatePanels() {
    releaseSelection();
    $("visualPanel").hidden = previewing || mode !== "visual";
    $("htmlPanel").hidden = previewing || mode !== "html";
    $("previewPanel").hidden = !previewing;
    $("editorToolbar").hidden = previewing || mode !== "visual";
    $("visualModeBtn").setAttribute("aria-pressed", String(mode === "visual" && !previewing));
    $("htmlModeBtn").setAttribute("aria-pressed", String(mode === "html" && !previewing));
    $("previewBtn").setAttribute("aria-pressed", String(previewing));
    $("previewBtn").textContent = previewing ? "編集に戻る" : "プレビュー";
    closeMedia();
  }
  function setMode(next) {
    recordHistory();
    const html = getBody();
    if (next === "html" && mode !== "html") $("htmlSource").value = html;
    if (next === "visual" && mode !== "visual") setBody(html);
    mode = next; previewing = false; updatePanels(); refresh();
  }
  function openInsert(kind) {
    captureRange();
    insertKind = kind;
    linkNode = savedRange ? (savedRange.startContainer.nodeType === 1 ? savedRange.startContainer : savedRange.startContainer.parentElement).closest("a") : null;
    $("insertDialogTitle").textContent = kind === "link" ? "リンクを挿入" : "YouTube動画を挿入";
    $("insertUrl").value = kind === "link" ? linkNode?.getAttribute("href") || "" : "";
    $("insertText").value = savedRange?.toString() || linkNode?.textContent || "";
    $("linkTextField").hidden = kind !== "link";
    $("unlinkBtn").hidden = kind !== "link" || !linkNode;
    $("insertError").textContent = "";
    $("insertDialog").showModal();
    $("insertUrl").focus();
  }
  function closeMedia() {
    body.querySelectorAll("[data-selected]").forEach((node) => node.removeAttribute("data-selected"));
    selectedMedia = null; $("mediaTools").hidden = true;
  }
  function selectMedia(image) {
    closeMedia(); captureRange();
    selectedMedia = image;
    image.dataset.selected = "true";
    $("mediaAlt").value = image.alt;
    $("mediaSize").value = image.closest("figure")?.classList.contains("small-media") ? "small-media" : image.closest("figure")?.classList.contains("medium-media") ? "medium-media" : "";
    $("mediaTools").hidden = false;
  }
  function removeMedia() {
    if (!selectedMedia) return;
    recordHistory();
    (selectedMedia.closest("figure") || selectedMedia).remove();
    closeMedia(); changed(true);
  }

  function isImage(file) { return /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name) && (!file.type || /^image\//.test(file.type)); }
  function uniqueName(value) {
    const original = String(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "") || "image.png";
    const dot = original.lastIndexOf("."), base = original.slice(0, dot), ext = original.slice(dot);
    let name = original, index = 2;
    while (assets.some((asset) => asset.name.toLowerCase() === name.toLowerCase())) name = `${base}-${index++}${ext}`;
    return name;
  }
  async function addFiles(fileList, action = "library", prefix = "") {
    const incoming = Array.from(fileList || []), added = [];
    const targetDraft = draftId, startingRevision = revision;
    for (const incomingFile of incoming) {
      if (!isImage(incomingFile)) continue;
      const prepared = prefix ? { file: incomingFile } : await window.BlogImageTools.prepare(incomingFile, $("optimizeImages").checked);
      if (draftId !== targetDraft) { notify("記事が切り替わったため、画像の追加を中止しました。"); return []; }
      const file = prepared.file;
      const name = uniqueName(file.name);
      const aliases = [C.folderPath(metadata()) + encodeURIComponent(name)];
      if (prefix) aliases.push(prefix + file.name, prefix + encodeURIComponent(file.name), file.name, file.webkitRelativePath?.split("/").slice(1).join("/") || file.name);
      const asset = { ...prepared, id: crypto.randomUUID(), name, file, url: URL.createObjectURL(file), aliases };
      assets.push(asset); added.push(asset);
    }
    if (!added.length) { notify("PNG・JPEG・GIF・WebP・AVIF・SVGの画像を選んでください。"); return []; }
    renderAssets();
    if (action === "insert" && revision === startingRevision) insertImages(added);
    else if (action === "cover") { fields.image.value = assetPath(added[0]); changed(); }
    else { prepareBody(); changed(); }
    if (action === "insert" && revision !== startingRevision && !body.querySelector(`img[src="${added[0].url}"]`)) notify("編集中の位置が変わったため、画像をライブラリに追加しました。画像を押して挿入できます。");
    else if (added.length < incoming.length) notify("対応している画像のみ追加しました。");
    return added;
  }
  function insertImages(items) {
    insertHtml(items.map((asset) => `<figure><img src="${esc(assetPath(asset))}" alt="" loading="lazy"><figcaption></figcaption></figure>`).join("") + "<p><br></p>", true);
  }
  function renderAssets() {
    $("assetList").innerHTML = assets.map((asset) => `<div class="library-item" data-asset="${esc(asset.id)}">
      <button class="library-image" type="button" data-action="insert" aria-label="${esc(asset.name)}を本文に挿入"><img src="${esc(asset.url)}" alt=""></button>
      <span title="${esc(asset.name)}">${esc(asset.name)}<small> ${Math.max(1, Math.round(asset.file.size / 1024)).toLocaleString()} KB${asset.originalSize > asset.file.size ? `・${Math.round((1 - asset.file.size / asset.originalSize) * 100)}% 削減` : ""}</small></span>
      <div class="library-actions"><button type="button" data-action="cover">カバーに</button><button type="button" data-action="download" aria-label="${esc(asset.name)}を保存">保存</button><button type="button" data-action="remove" aria-label="${esc(asset.name)}を削除">×</button></div></div>`).join("");
  }
  function assetReferenced(asset) {
    const html = getBody();
    return findAsset(fields.image.value) === asset || html.includes(assetPath(asset)) || asset.aliases.some((path) => path && html.includes(path));
  }
  async function importFiles(fileList, folder = false) {
    const files = Array.from(fileList || []);
    const file = folder ? files.find((item) => /(^|\/)index\.html?$/i.test(item.webkitRelativePath || item.name) && (item.webkitRelativePath || item.name).split("/").length <= 2) : files[0];
    if (!file) throw new Error("選んだフォルダの直下に index.html が見つかりません。");
    const data = C.parseArticle(await file.text());
    await retainCurrent();
    loadDocument(data);
    if (folder && files.some(isImage)) await addFiles(files.filter(isImage), "library", C.folderPath(data));
    // 相対パスで書かれた既存記事も、記事フォルダ内の画像として解決する。
    setBody(data.body);
    const coverAsset = findAsset(fields.image.value);
    if (coverAsset) fields.image.value = assetPath(coverAsset);
    renderAssets(); history = []; historyIndex = -1; changed(true);
    $("importDialog").close();
    notify(`${file.name} を読み込みました。${folder ? "画像も一緒に編集できます。" : "画像が表示されない場合は記事フォルダごと開いてください。"}`);
  }
  let catalog = null;
  async function readCatalog() {
    const response = await fetch("/blog/articles.json", { cache: "no-cache", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("公開済みの記事一覧を取得できませんでした。");
    const result = await response.json();
    if (!Array.isArray(result) || result.some((item) => typeof item.title !== "string" || typeof item.url !== "string")) throw new Error("記事一覧の形式を確認できません。");
    catalog = result;
    return catalog;
  }
  async function openPublished(index) {
    const article = catalog?.[index];
    if (!article) return;
    const url = new URL(article.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/blog/")) throw new Error("記事のURLを確認してください。");
    $("importStatus").textContent = "本文と画像を読み込んでいます…";
    const response = await fetch(url, { cache: "no-cache", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("記事を読み込めませんでした。");
    const html = await response.text();
    if (!new DOMParser().parseFromString(html, "text/html").querySelector(".article-body")) throw new Error("公開記事の本文が見つかりません。");
    const data = { ...C.parseArticle(html), ...article, originalPermalink: url.pathname,
      tags: Array.isArray(article.tags) ? article.tags.join(", ") : article.tags || "", assets: [] };
    const doc = new DOMParser().parseFromString(data.body, "text/html");
    const refs = new Set([data.image, ...[...doc.querySelectorAll("img[src], [poster], [style]")].flatMap((node) =>
      [node.getAttribute("src"), node.getAttribute("poster"), node.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1]])].filter(Boolean));
    let missing = 0;
    for (const ref of refs) {
      const imageUrl = new URL(ref, url);
      if (imageUrl.origin !== location.origin) continue;
      try {
        const image = await fetch(imageUrl, { signal: AbortSignal.timeout(15000) });
        if (!image.ok || !/^image\//.test(image.headers.get("content-type") || "")) throw new Error("image");
        const blob = await image.blob();
        const original = decodeURIComponent(imageUrl.pathname.split("/").pop()).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-");
        let name = original, suffix = 2;
        while (data.assets.some((asset) => asset.name === name)) name = suffix++ + "-" + original;
        data.assets.push({ id: crypto.randomUUID(), name, file: blob, aliases: [ref, imageUrl.href, imageUrl.pathname] });
      } catch { missing++; }
    }
    await retainCurrent();
    loadDocument(data); changed(true); $("importDialog").close();
    notify(missing ? `記事を開きました。${missing}件の画像を取得できません。書き出す前に追加してください。` : "公開済みの記事を画像と一緒に開きました。");
  }
  function appendHtml() {
    const html = C.sanitize($("htmlInput").value);
    if (!html) return;
    recordHistory();
    const combined = getBody() + "\n" + html;
    if (mode === "html") $("htmlSource").value = combined; else setBody(combined);
    changed(true); $("importDialog").close(); notify("本文の末尾に追加しました。");
  }
  function download(blob, name) {
    const link = document.createElement("a"), url = URL.createObjectURL(blob);
    link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function validate() {
    const issues = exportIssues();
    if (issues.length) throw new Error(issues[0].message);
    if (extra.originalPermalink && normalizePath(extra.originalPermalink) !== normalizePath(C.permalink(metadata())) &&
      !window.confirm("公開日またはURL末尾が変わっています。新しいURLで書き出しますか？ 既存記事へのリンクを維持する場合は元の設定へ戻してください。")) throw new DOMException("Canceled", "AbortError");
  }
  function missingAssets() {
    return C.mediaReferences(getBody(), fields.image.value).filter((ref) => !findAsset(ref) && !/^(?:https?:|data:)/i.test(ref));
  }
  function exportIssues() {
    const data = metadata(), issues = C.publicationIssues({ ...data, body: getBody() });
    if (missingAssets().length) issues.push({ field: "imagesCard", message: "未追加の画像・メディアがあります。ライブラリへ追加するか、公開済みのURLを指定してください。" });
    const url = normalizePath(C.permalink(data));
    if (catalog?.some((article) => normalizePath(article.url) === url) && normalizePath(extra.originalPermalink) !== url) issues.push({ field: "slug", message: "この公開URLは別の記事で使用中です。URLの末尾を変更するか、公開済みの記事を開いて編集してください。" });
    return issues;
  }
  function renderChecklist() {
    const issues = exportIssues();
    $("publishChecklist").innerHTML = issues.map((issue) => `<li class="warn"><button type="button" data-fix="${issue.field}">${esc(issue.message)}</button></li>`).join("") +
      (!issues.length ? '<li class="ok">本文・記事情報・画像の準備ができています</li>' : "") +
      (!fields.description.value.trim() ? '<li class="warn">説明は未入力です。「本文から説明を作る」で追加できます。</li>' : "") +
      (!catalog ? '<li class="warn">公開URLの重複チェックは未実施です。通信状態を確認して、この画面を開き直してください。</li>' : "");
  }
  const source = () => C.articleSource({ ...metadata(), body: getBody() });
  async function exportZip() {
    validate();
    const data = metadata(), folder = C.folderName(data), html = source();
    const files = [{ path: folder + "/index.html", bytes: new TextEncoder().encode(html) }, ...assets.map((asset) => ({ path: folder + "/" + asset.name, bytes: asset.file }))];
    download(await C.createZip(files), folder + ".zip");
    $("exportStatus").textContent = "ZIPを書き出しました。解凍したフォルダを blog/articles に置いてください。";
    await saveDraft();
  }
  let exportRoot = null;
  function folderLabel() {
    $("publicArticleLink").href = "https://xenoah.github.io" + C.permalink(metadata());
    $("savedFolderLabel").textContent = exportRoot ? `保存先: ${exportRoot.name} / ${C.folderName(metadata())}` : "blog/articles フォルダダイアログで一度選ぶと、次回も同じ場所へ保存できます。";
    $("changeFolderBtn").hidden = !window.showDirectoryPicker;
    $("saveFolderBtn").hidden = !window.showDirectoryPicker;
  }
  draftStore.setting("exportRoot").then((handle) => { exportRoot = handle || null; folderLabel(); }).catch(folderLabel);
  async function chooseExportRoot() {
    const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "blog-articles" });
    exportRoot = handle; folderLabel();
    try { await draftStore.setting("exportRoot", handle); }
    catch { notify("今回の保存先を選びました。このブラウザでは保存先を記憶できません。"); }
    return handle;
  }
  async function saveFolder() {
    validate();
    if (!window.showDirectoryPicker) throw new Error("このブラウザでは画像込みZIPを使って保存してください。");
    const data = metadata(), html = source(), snapshotAssets = [...assets];
    const root = exportRoot || await chooseExportRoot();
    if (root.queryPermission && await root.queryPermission({ mode: "readwrite" }) !== "granted" &&
      await root.requestPermission({ mode: "readwrite" }) !== "granted") throw new Error("フォルダへの保存を許可してください。");
    const dir = await root.getDirectoryHandle(C.folderName(data), { create: true });
    try {
      await dir.getFileHandle("index.html");
      if (!window.confirm(`${root.name}/${C.folderName(data)}/index.html を更新しますか？`)) return;
    } catch (error) { if (error.name !== "NotFoundError") throw error; }
    // Images first: a failed image write must not replace the existing article.
    for (const file of [...snapshotAssets, { name: "index.html", file: html }]) {
      const handle = await dir.getFileHandle(file.name, { create: true });
      const writer = await handle.createWritable(); await writer.write(file.file); await writer.close();
    }
    $("exportStatus").textContent = `${root.name}/${C.folderName(data)} に保存しました。Gitでcommit・pushすると公開されます。`;
    await saveDraft();
  }
  async function copy(text) {
    if (!navigator.clipboard) throw new Error("コピーに対応していません。HTMLのダウンロードをご利用ください。");
    await navigator.clipboard.writeText(text);
    $("exportStatus").textContent = "コピーしました。";
  }
  function on(id, event, callback) {
    $(id).addEventListener(event, async (e) => {
      try { await callback(e); }
      catch (error) {
        if (error.name === "AbortError") return;
        const message = error.message || "操作できませんでした。もう一度お試しください。";
        const target = $("exportDialog").open ? $("exportStatus") : $("importDialog").open ? $("importStatus") : $("appStatus");
        target.textContent = message;
      }
    });
  }

  let contextImage = null, contextSourceSelection = null;
  const contextMenu = $("editorContextMenu");
  function closeContextMenu(restoreFocus = false) {
    if (contextMenu.hidden) return;
    contextMenu.hidden = true;
    if (restoreFocus) {
      if (mode === "html") $("htmlSource").focus(); else restoreRange();
    }
  }
  function openContextMenu(event) {
    if (event.shiftKey || previewing || composing) return;
    event.preventDefault();
    recordHistory(); captureRange();
    contextImage = event.target.closest("img");
    if (contextImage && !body.contains(contextImage)) contextImage = null;
    if (contextImage) selectMedia(contextImage);
    const source = $("htmlSource");
    contextSourceSelection = { start: source.selectionStart, end: source.selectionEnd };
    const hasSelection = mode === "html" ? source.selectionStart !== source.selectionEnd : !!savedRange?.toString();
    contextMenu.querySelectorAll("[data-visual]").forEach((button) => { button.hidden = mode !== "visual" || !!contextImage; });
    contextMenu.querySelectorAll("[data-media]").forEach((button) => { button.hidden = !contextImage; });
    contextMenu.querySelector('[data-context="undo"]').disabled = historyIndex < 1;
    contextMenu.querySelector('[data-context="redo"]').disabled = historyIndex >= history.length - 1;
    for (const action of ["cut", "copy"]) contextMenu.querySelector(`[data-context="${action}"]`).disabled = !hasSelection;
    contextMenu.querySelector('[data-context="paste"]').disabled = !navigator.clipboard?.readText;
    contextMenu.hidden = false;
    const x = event.clientX || (mode === "html" ? source : body).getBoundingClientRect().left + 24;
    const y = event.clientY || (mode === "html" ? source : body).getBoundingClientRect().top + 24;
    contextMenu.style.left = Math.max(8, Math.min(x, window.innerWidth - contextMenu.offsetWidth - 8)) + "px";
    contextMenu.style.top = Math.max(8, Math.min(y, window.innerHeight - contextMenu.offsetHeight - 8)) + "px";
    contextMenu.querySelector("button:not([disabled]):not([hidden])")?.focus({ preventScroll: true });
  }
  async function contextClipboard(action, rich = false) {
    const source = $("htmlSource"), revisionAtClick = revision, modeAtClick = mode;
    const rangeAtClick = savedRange?.cloneRange(), sourceSelection = contextSourceSelection && { ...contextSourceSelection };
    if (action === "paste") {
      try {
        let text = "", html = "", files = [];
        if (rich && navigator.clipboard.read) {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            if (item.types.includes("text/html")) html += await (await item.getType("text/html")).text();
            if (item.types.includes("text/plain")) text += await (await item.getType("text/plain")).text();
            const type = item.types.find((type) => type.startsWith("image/"));
            if (type && !html) files.push(new File([await item.getType(type)], "clipboard." + type.split("/")[1], { type }));
          }
        } else text = await navigator.clipboard.readText();
        if (revision !== revisionAtClick || mode !== modeAtClick) { notify("本文が変更されたため、貼り付け位置を選び直してください。"); return; }
        if (rangeAtClick) savedRange = rangeAtClick;
        if (mode === "html") {
          recordHistory(); source.setRangeText(text, sourceSelection.start, sourceSelection.end, "end"); changed(true);
        } else if (files.length && !html) await addFiles(files, "insert");
        else if (html || text) insertHtml(html || text.split(/\r?\n\r?\n/).map((p) => "<p>" + esc(p).replace(/\r?\n/g, "<br>") + "</p>").join(""));
      } catch { notify("貼り付けを許可するか、本文で Ctrl / ⌘ + V を使ってください。"); }
      return;
    }
    const text = mode === "html" ? source.value.slice(sourceSelection.start, sourceSelection.end) : rangeAtClick?.toString();
    if (!text) return;
    if (rich && mode === "visual" && navigator.clipboard.write && window.ClipboardItem) {
      const holder = document.createElement("div"); holder.append(rangeAtClick.cloneContents()); mapMedia(holder, false);
      await navigator.clipboard.write([new ClipboardItem({
        "text/plain": new Blob([text], { type: "text/plain" }),
        "text/html": new Blob([C.sanitize(holder.innerHTML)], { type: "text/html" })
      })]);
    } else await navigator.clipboard.writeText(text);
    if (action === "cut" && revision === revisionAtClick && mode === modeAtClick) {
      recordHistory();
      if (mode === "html") source.setRangeText("", sourceSelection.start, sourceSelection.end, "end");
      else { savedRange = rangeAtClick; restoreRange().deleteContents(); captureRange(); }
      changed(true);
    }
  }
  on("visualPanel", "contextmenu", (event) => { if (!event.target.closest("textarea, input, button")) openContextMenu(event); });
  on("htmlSource", "contextmenu", openContextMenu);
  on("editorContextMenu", "click", async (event) => {
    const button = event.target.closest("[data-context]");
    if (!button || button.disabled) return;
    const action = button.dataset.context;
    closeContextMenu();
    if (action === "undo" || action === "redo") undoRedo(action === "undo" ? -1 : 1);
    else if (["copy", "cut", "paste"].includes(action)) await contextClipboard(action);
    else if (action === "selectAll") {
      if (mode === "html") { $("htmlSource").focus(); $("htmlSource").select(); }
      else { savedRange = document.createRange(); savedRange.selectNodeContents(body); restoreRange(); }
    } else if (action === "bold") command("bold");
    else if (action === "highlight") command("hiliteColor", "#fff0a8");
    else if (["h2", "h3", "p"].includes(action)) command("formatBlock", action);
    else if (action === "link") openInsert("link");
    else if (action === "image") { $("imageFiles").dataset.action = "insert"; $("imageFiles").click(); }
    else if (action === "editImage") { selectMedia(contextImage); $("mediaAlt").focus(); }
    else if (action === "cover") {
      const asset = findAsset(contextImage.getAttribute("src"));
      fields.image.value = asset ? assetPath(asset) : contextImage.getAttribute("src"); changed();
    } else if (action === "removeImage") { selectedMedia = contextImage; removeMedia(); }
  });
  on("editorContextMenu", "keydown", (event) => {
    if (event.key === "Escape" || event.key === "Tab") { event.preventDefault(); closeContextMenu(true); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...contextMenu.querySelectorAll("button:not([disabled]):not([hidden])")];
    let index = buttons.indexOf(document.activeElement);
    index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  });
  document.addEventListener("pointerdown", (event) => { if (!contextMenu.contains(event.target)) closeContextMenu(); });
  window.addEventListener("resize", () => closeContextMenu());
  // Focus and image tools can trigger layout scrolling after contextmenu fires.
  // Dismiss only for deliberate scrolling, so the freshly opened menu stays open.
  for (const eventName of ["wheel", "touchmove"]) {
    document.addEventListener(eventName, (event) => { if (!contextMenu.contains(event.target)) closeContextMenu(); }, { passive: true });
  }

  document.addEventListener("selectionchange", () => { if (!composing) { captureRange(); toolbarState(); } });
  const toolbar = $("editorToolbar");
  // Capture before focus leaves the manuscript. Color pickers may clear native selection.
  toolbar.addEventListener("pointerdown", pinSelection);
  toolbar.addEventListener("mousedown", (event) => { pinSelection(); if (event.target.closest("button")) event.preventDefault(); });
  toolbar.addEventListener("focusin", pinSelection);
  document.addEventListener("pointerdown", (event) => { if (!toolbar.contains(event.target)) releaseSelection(); });
  document.addEventListener("focusin", (event) => { if (!toolbar.contains(event.target)) releaseSelection(); });
  toolbar.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault(); restoreRange();
      $("moreFormatting").hidden = true; $("moreFormattingBtn").setAttribute("aria-expanded", "false");
    }
  });
  formatting = window.BlogEditorFormatting.mount({
    body, $, on, command, insertHtml, notify, clipboard: contextClipboard,
    edit(callback, mutates = true) {
      if (mode !== "visual" || previewing || composing) return;
      if (mutates) recordHistory();
      const next = callback(restoreRange());
      if (next) { savedRange = next; restoreRange(); }
      captureRange();
      if (mutates) { prepareBody(); changed(true); }
      toolbarState();
    }
  });
  document.querySelectorAll("[data-command]").forEach((button) => button.addEventListener("click", () => command(button.dataset.command)));
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => $(button.dataset.close).close()));
  on("blockFormat", "change", () => command("formatBlock", $("blockFormat").value));
  on("dividerBtn", "click", () => insertHtml("<hr><p><br></p>", true));
  on("undoBtn", "click", () => undoRedo(-1));
  on("redoBtn", "click", () => undoRedo(1));
  on("visualModeBtn", "click", () => setMode("visual"));
  on("htmlModeBtn", "click", () => setMode("html"));
  on("previewBtn", "click", () => { previewing = !previewing; updatePanels(); refresh(); });
  on("linkBtn", "click", () => openInsert("link"));
  on("videoBtn", "click", () => openInsert("video"));
  on("insertForm", "submit", (event) => {
    event.preventDefault();
    const url = insertKind === "video" ? C.youtubeUrl($("insertUrl").value.trim()) : C.safeUrl($("insertUrl").value);
    if (!url) { $("insertError").textContent = insertKind === "video" ? "YouTubeの動画URLを入力してください。" : "有効なURLを入力してください。"; return; }
    $("insertDialog").close();
    if (insertKind === "video") insertHtml(`<div class="embed"><iframe src="${esc(url)}" title="YouTube動画" loading="lazy" allowfullscreen></iframe></div><p><br></p>`, true);
    else if (linkNode && body.contains(linkNode)) {
      recordHistory(); linkNode.href = url;
      const label = $("insertText").value.trim() || url;
      if (label !== linkNode.textContent.trim()) linkNode.textContent = label;
      changed(true);
    } else insertHtml(`<a href="${esc(url)}">${esc($("insertText").value.trim() || url)}</a>`);
  });
  on("unlinkBtn", "click", () => {
    recordHistory();
    if (linkNode && body.contains(linkNode)) linkNode.replaceWith(...linkNode.childNodes);
    $("insertDialog").close(); changed(true);
  });
  on("body", "input", () => { if (!composing) { formatting.normalizeTyping(); changed(); } });
  on("body", "compositionstart", () => { composing = true; clearTimeout(historyTimer); });
  on("body", "compositionend", () => { composing = false; formatting.normalizeTyping(); changed(); });
  on("body", "beforeinput", (event) => {
    if (event.inputType === "historyUndo" || event.inputType === "historyRedo") {
      event.preventDefault(); undoRedo(event.inputType === "historyUndo" ? -1 : 1);
    }
  });
  on("body", "keydown", (event) => {
    if (event.isComposing || composing) return;
    const embed = event.target.closest(".embed");
    if (embed && ["Delete", "Backspace"].includes(event.key)) {
      event.preventDefault(); recordHistory(); embed.remove(); changed(true); return;
    }
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === "z" || key === "y") { event.preventDefault(); undoRedo(key === "y" || event.shiftKey ? 1 : -1); }
      else if (key === "k") { event.preventDefault(); openInsert("link"); }
      else if (["b", "i", "u"].includes(key)) { event.preventDefault(); command({ b: "bold", i: "italic", u: "underline" }[key]); }
      return;
    }
    if (selectedMedia && ["Delete", "Backspace"].includes(event.key)) { event.preventDefault(); removeMedia(); return; }
    const selection = window.getSelection();
    const node = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement;
    if (event.key === "Tab" && node?.closest("td,th")) {
      const cell = node.closest("td,th"), table = cell.closest("table");
      const cells = [...table.querySelectorAll("td,th")].filter((item) => item.closest("table") === table);
      let next = cells[cells.indexOf(cell) + (event.shiftKey ? -1 : 1)];
      if (!next && !event.shiftKey) {
        recordHistory();
        const row = table.createTBody === undefined ? null : (table.tBodies[0] || table.createTBody()).insertRow();
        if (row) {
          for (let i = 0; i < cell.parentElement.cells.length; i++) row.insertCell().innerHTML = "<p><br></p>";
          next = row.cells[0];
        }
        changed(true);
      }
      if (next) {
        event.preventDefault();
        savedRange = document.createRange(); savedRange.selectNodeContents(next.querySelector("p") || next); savedRange.collapse(true); restoreRange();
      }
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && node?.closest("figcaption")) {
      event.preventDefault(); const figure = node.closest("figure");
      const paragraph = document.createElement("p"); paragraph.innerHTML = "<br>"; figure.after(paragraph);
      const range = document.createRange(); range.selectNodeContents(paragraph); range.collapse(true); savedRange = range; restoreRange(); changed(true);
    } else if (event.key === "Escape") { closeMedia(); command("formatBlock", "p"); }
    else if (event.key === "Enter" && !event.shiftKey) {
      const block = node?.closest("h2,h3,blockquote,pre");
      if (block && !block.textContent.trim()) { event.preventDefault(); command("formatBlock", "p"); }
    }
  });
  on("body", "click", (event) => {
    if (event.target.closest("a")) event.preventDefault();
    if (event.target.localName === "img") selectMedia(event.target); else closeMedia();
  });
  on("body", "paste", async (event) => {
    event.preventDefault(); captureRange();
    const images = [...event.clipboardData.files].filter(isImage);
    if (images.length) { await addFiles(images, "insert"); return; }
    const html = event.clipboardData.getData("text/html");
    const plain = event.clipboardData.getData("text/plain");
    insertHtml(html || plain.split(/\r?\n\r?\n/).map((paragraph) => "<p>" + esc(paragraph).replace(/\r?\n/g, "<br>") + "</p>").join(""));
  });
  on("body", "dragstart", (event) => { if (event.target.closest("figure")) event.preventDefault(); });
  on("mediaAlt", "input", () => { if (selectedMedia) { selectedMedia.alt = $("mediaAlt").value; changed(); } });
  on("mediaSize", "change", () => {
    if (!selectedMedia) return;
    recordHistory();
    let figure = selectedMedia.closest("figure");
    if (!figure) { figure = document.createElement("figure"); selectedMedia.replaceWith(figure); figure.append(selectedMedia); }
    figure.classList.remove("small-media", "medium-media");
    if ($("mediaSize").value) figure.classList.add($("mediaSize").value);
    prepareBody(); changed(true);
  });
  on("removeMediaBtn", "click", removeMedia);
  on("closeMediaBtn", "click", closeMedia);
  on("htmlSource", "input", () => changed());
  on("htmlSource", "keydown", (event) => {
    if (event.isComposing || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    if (key === "z" || key === "y") { event.preventDefault(); undoRedo(key === "y" || event.shiftKey ? 1 : -1); }
  });
  on("insertImageBtn", "click", () => { captureRange(); $("imageFiles").dataset.action = "insert"; $("imageFiles").click(); });
  on("addImagesBtn", "click", () => { $("imageFiles").dataset.action = "library"; $("imageFiles").click(); });
  on("imageFiles", "change", async () => { await addFiles($("imageFiles").files, $("imageFiles").dataset.action || "library"); $("imageFiles").value = ""; });
  on("addCoverBtn", "click", () => $("coverFile").click());
  on("coverFile", "change", async () => { await addFiles($("coverFile").files, "cover"); $("coverFile").value = ""; });
  on("removeCoverBtn", "click", () => { fields.image.value = ""; changed(); });
  on("assetList", "click", (event) => {
    const button = event.target.closest("[data-action]"), item = button?.closest("[data-asset]");
    const asset = item && assets.find((asset) => asset.id === item.dataset.asset);
    if (!asset) return;
    if (button.dataset.action === "insert") { if (previewing) { previewing = false; updatePanels(); } insertImages([asset]); }
    else if (button.dataset.action === "cover") { fields.image.value = assetPath(asset); changed(); }
    else if (button.dataset.action === "download") download(asset.file, asset.name);
    else if (button.dataset.action === "remove") {
      if (assetReferenced(asset)) { notify("本文やカバーで使用中です。先に記事から画像を外してください。"); return; }
      assets = assets.filter((item) => item !== asset); URL.revokeObjectURL(asset.url);
      // 画像のない履歴を復元しないよう、素材を破棄した時点で履歴を区切る。
      history = []; historyIndex = -1; renderAssets(); changed(true);
    }
  });
  for (const [id, action] of [["body", "insert"], ["coverArea", "cover"], ["addImagesBtn", "library"]]) {
    const zone = $(id);
    zone.addEventListener("dragover", (event) => { if ([...event.dataTransfer.types].includes("Files")) { event.preventDefault(); zone.classList.add("is-dragging"); } });
    zone.addEventListener("dragleave", (event) => { if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-dragging"); });
    zone.addEventListener("drop", async (event) => {
      zone.classList.remove("is-dragging");
      if (!event.dataTransfer.files.length && id !== "body") return;
      event.preventDefault();
      if (id === "body") {
        const position = document.caretPositionFromPoint?.(event.clientX, event.clientY);
        const range = position ? document.createRange() : document.caretRangeFromPoint?.(event.clientX, event.clientY);
        if (position) { range.setStart(position.offsetNode, position.offset); range.collapse(true); }
        if (range && body.contains(range.startContainer)) savedRange = range;
      }
      if (event.dataTransfer.files.length) {
        try { await addFiles(event.dataTransfer.files, action); } catch (error) { notify(error.message); }
      }
      else {
        const html = event.dataTransfer.getData("text/html");
        const text = event.dataTransfer.getData("text/plain");
        if (html || text) insertHtml(html || esc(text).replace(/\r?\n/g, "<br>"));
      }
    });
  }
  // ファイルを領域外へ落としてページが移動し、原稿を失うのを防ぐ。
  window.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
  window.addEventListener("drop", (e) => { if (e.dataTransfer.files.length) e.preventDefault(); });
  fieldNames.forEach((key) => fields[key].addEventListener("input", (event) => {
    if (key === "title" && !fields.slug.dataset.touched) fields.slug.value = C.slugify(fields.title.value);
    if (key === "slug") fields.slug.dataset.touched = "true";
    if (!event.isComposing) changed();
  }));
  on("openImportBtn", "click", () => { $("importStatus").textContent = ""; $("importDialog").showModal(); });
  on("chooseHtmlBtn", "click", () => $("importHtmlFile").click());
  on("chooseFolderBtn", "click", () => $("importFolder").click());
  on("loadPublishedBtn", "click", async () => {
    $("importStatus").textContent = "記事一覧を読み込んでいます…";
    const articles = await readCatalog();
    $("publishedList").innerHTML = articles.map((article, index) => `<button class="writing-button" type="button" data-published="${index}">${esc(article.title)}<small> ${esc(article.date)}</small></button>`).join("");
    $("importStatus").textContent = articles.length ? "開く記事を選んでください。" : "公開済みの記事はありません。";
  });
  let openingPublished = false;
  on("publishedList", "click", async (event) => {
    const button = event.target.closest("[data-published]");
    if (!button || openingPublished) return;
    openingPublished = true; button.disabled = true;
    try { await openPublished(Number(button.dataset.published)); }
    finally { openingPublished = false; button.disabled = false; }
  });
  on("importHtmlFile", "change", async () => { try { await importFiles($("importHtmlFile").files); } finally { $("importHtmlFile").value = ""; } });
  on("importFolder", "change", async () => { try { await importFiles($("importFolder").files, true); } finally { $("importFolder").value = ""; } });
  on("appendHtmlBtn", "click", appendHtml);
  on("replaceHtmlBtn", "click", async () => {
    if (!$("htmlInput").value.trim()) return;
    const data = C.parseArticle($("htmlInput").value);
    await retainCurrent(); loadDocument(data); changed(true); $("importDialog").close();
  });
  on("outline", "click", (event) => {
    const button = event.target.closest("[data-heading]");
    if (!button) return;
    setMode("visual");
    const heading = body.querySelectorAll("h2,h3")[Number(button.dataset.heading)];
    if (heading) {
      heading.scrollIntoView({ block: "center", behavior: "auto" });
      const range = document.createRange(); range.selectNodeContents(heading); range.collapse(false); savedRange = range; restoreRange();
    }
  });
  on("saveDraftBtn", "click", () => saveDraft(true));
  on("openDraftsBtn", "click", showDrafts);
  on("draftList", "click", async (event) => {
    const button = event.target.closest("[data-draft]");
    if (!button) return;
    try {
      await retainCurrent();
      const version = button.hasAttribute("data-version") ? Number(button.dataset.version) : undefined;
      const record = await draftStore.read(button.dataset.draft, version);
      if (!record) throw new Error("下書きが見つかりません。");
      if (version == null) {
        loadDocument(record.data, record.id, record.seq);
        await draftStore.setting("activeDraft", record.id);
      } else { loadDocument(record.data); await saveDraft(); }
      $("draftsDialog").close(); saveState(version == null ? "下書きを開きました" : "履歴を別の下書きへ復元しました");
    } catch (error) { $("draftStatus").textContent = error.message; }
  });
  on("newArticleBtn", "click", async () => {
    await retainCurrent();
    loadDocument({ body: "", date: C.localDate(), slug: "new-article" });
    delete fields.slug.dataset.touched; renderAssets(); history = []; historyIndex = -1; changed(true); fields.title.focus();
  });
  on("makeDescriptionBtn", "click", () => {
    fields.description.value = Array.from(C.textFromHtml(getBody())).slice(0, 150).join("");
    changed(); fields.description.focus(); notify("本文の先頭から説明を作りました。内容を確認して整えてください。");
  });
  on("publishChecklist", "click", (event) => {
    const button = event.target.closest("[data-fix]");
    if (!button) return;
    $("exportDialog").close();
    const field = $(button.dataset.fix);
    if (field.closest("details")) field.closest("details").open = true;
    if (button.dataset.fix === "body") setMode("visual");
    field.scrollIntoView({ block: "center" }); field.focus();
  });
  on("openExportBtn", "click", async () => {
    refresh(); renderChecklist(); folderLabel(); $("exportStatus").textContent = "公開URLを確認しています…"; $("exportDialog").showModal();
    const buttons = ["exportFolderBtn", "saveFolderBtn", "downloadBtn", "copyBtn"].map($);
    buttons.forEach((button) => { button.disabled = true; });
    try { await readCatalog(); $("exportStatus").textContent = ""; }
    catch { catalog = null; $("exportStatus").textContent = "記事一覧を取得できませんでした。オフラインでも書き出せますが、公開URLの重複は確認してください。"; }
    finally { buttons.forEach((button) => { button.disabled = false; }); renderChecklist(); }
  });
  on("exportFolderBtn", "click", exportZip);
  on("saveFolderBtn", "click", saveFolder);
  on("changeFolderBtn", "click", chooseExportRoot);
  on("checkDeploymentBtn", "click", async () => {
    const status = $("deploymentStatus");
    status.textContent = "GitHubの公開状況を確認しています…";
    $("checkDeploymentBtn").disabled = true;
    try {
      const response = await fetch("https://api.github.com/repos/Xenoah/Xenoah.github.io/actions/runs?branch=main&per_page=30", { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("公開状況を取得できませんでした。「公開ページを開く」から確認してください。");
      const data = await response.json();
      const deployment = data.workflow_runs.find((run) => ["pages build and deployment", "Publish site"].includes(run.name));
      if (!deployment) throw new Error("直近の公開処理が見つかりません。GitHub Actionsで確認してください。");
      const state = deployment.status !== "completed" ? "処理中" : deployment.conclusion === "success" ? "成功" : deployment.conclusion === "cancelled" ? "取り消し" : "失敗";
      status.textContent = `サイト全体の直近の公開: ${state} / ${deployment.head_sha.slice(0, 7)} / ${new Date(deployment.updated_at).toLocaleString("ja-JP")}。この記事の変更が含まれるかは公開ページで確認してください。`;
    } catch (error) { status.textContent = error.message; }
    finally { $("checkDeploymentBtn").disabled = false; }
  });
  on("downloadBtn", "click", () => { validate(); download(new Blob([source()], { type: "text/html;charset=utf-8" }), "index.html"); $("exportStatus").textContent = "HTMLを書き出しました。画像は別途、同じ記事フォルダに配置してください。"; });
  on("copyBtn", "click", () => { validate(); return copy(source()); });
  on("copyPermalinkBtn", "click", () => copy("https://xenoah.github.io" + C.permalink(metadata())));
  on("copyTreeBtn", "click", () => copy(C.folderName(metadata()) + "/\n" + ["index.html", ...assets.map((asset) => asset.name)].map((name) => "  ├─ " + name).join("\n")));
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); saveDraft(true); }
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && revision !== savedRevision) saveDraft(); });
  window.addEventListener("beforeunload", (event) => { if (ready && revision !== savedRevision) { event.preventDefault(); event.returnValue = ""; } });
  const header = document.querySelector(".blog-header");
  if (header && window.ResizeObserver) new ResizeObserver(() => app.style.setProperty("--blog-header-height", header.getBoundingClientRect().height + "px")).observe(header);
  // 復元中の入力で前回の下書きを上書きしない。
  app.inert = true;
  restoreDraft().then((restored) => {
    if (!restored) saveState("自動保存が有効です");
  }).catch(() => saveState("下書きを読み込めませんでした", "error")).finally(() => {
    ready = true; app.inert = false; prepareBody(); renderAssets(); refresh(); recordHistory();
    document.execCommand("defaultParagraphSeparator", false, "p");
  });
})();
