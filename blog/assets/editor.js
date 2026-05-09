(function () {
  const $ = (id) => document.getElementById(id);
  const draftKey = "xenoah_blog_editor_draft_html_v1";
  const encoder = new TextEncoder();
  let assets = [];
  let draftTimer = 0;

  const fields = {
    title: $("title"),
    date: $("date"),
    slug: $("slug"),
    description: $("description"),
    tags: $("tags"),
    image: $("image"),
    body: $("body"),
    imageFiles: $("imageFiles"),
    importHtmlFile: $("importHtmlFile"),
    htmlInput: $("htmlInput")
  };

  const exportStatus = $("exportStatus");
  const draftStatus = $("draftStatus");
  const draftSaved = $("draftSaved");
  const imageStatus = $("imageStatus");
  const htmlStatus = $("htmlStatus");
  const checkStatus = $("checkStatus");
  const previewStatus = $("previewStatus");
  const articleFolderPath = $("articleFolderPath");
  const postPath = $("postPath");
  const preview = $("preview");
  const assetList = $("assetList");
  const publishChecklist = $("publishChecklist");
  const charCount = $("charCount");
  const imageCount = $("imageCount");
  const readTime = $("readTime");

  fields.date.value = new Date().toISOString().slice(0, 10);

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "article";
  }

  function cleanFileName(value) {
    const parts = String(value || "image.png").split(".");
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : "png";
    const base = slugify(parts.join(".") || "image");
    return `${base}.${ext.replace(/[^a-z0-9]/g, "") || "png"}`;
  }

  function uniqueAssetName(name) {
    const clean = cleanFileName(name);
    const dot = clean.lastIndexOf(".");
    const base = dot >= 0 ? clean.slice(0, dot) : clean;
    const ext = dot >= 0 ? clean.slice(dot) : "";
    const used = new Set(assets.map((asset) => asset.name));
    let candidate = clean;
    let count = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${count}${ext}`;
      count += 1;
    }
    return candidate;
  }

  function yamlString(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function splitTags() {
    return fields.tags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function articleFolderName() {
    return `${fields.date.value}-${slugify(fields.slug.value)}`;
  }

  function articleFolder() {
    return `blog/articles/${articleFolderName()}/`;
  }

  function publicArticleFolder() {
    return `/blog/articles/${articleFolderName()}/`;
  }

  function articleIndexPath() {
    return `${articleFolder()}index.html`;
  }

  function publicPermalink() {
    return `/blog/${fields.date.value.slice(0, 4)}/${fields.date.value.slice(5, 7)}/${fields.date.value.slice(8, 10)}/${slugify(fields.slug.value)}/`;
  }

  function assetPublicPath(asset) {
    return `${publicArticleFolder()}${asset.name}`;
  }

  function updatePaths() {
    articleFolderPath.textContent = articleFolder();
    postPath.textContent = articleIndexPath();
  }

  function frontMatter() {
    const tags = splitTags();
    const lines = [
      "---",
      "layout: post",
      "blog_article: true",
      `title: "${yamlString(fields.title.value)}"`,
      `date: ${fields.date.value}`,
      `description: "${yamlString(fields.description.value)}"`,
      `permalink: ${publicPermalink()}`
    ];

    if (tags.length) {
      lines.push("tags:");
      tags.forEach((tag) => lines.push(`  - "${yamlString(tag)}"`));
    }

    if (fields.image.value.trim()) {
      lines.push(`image: "${yamlString(fields.image.value.trim())}"`);
    }

    lines.push("---", "");
    return lines.join("\n");
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeUrl(value) {
    const trimmed = String(value || "").trim();
    if (/^\s*javascript:/i.test(trimmed)) {
      return "";
    }
    return trimmed;
  }

  function sanitizeArticleHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script,style,noscript,iframe[srcdoc]").forEach((node) => node.remove());
    doc.body.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) {
          node.removeAttribute(attr.name);
        }
        if ((name === "href" || name === "src") && !sanitizeUrl(attr.value)) {
          node.removeAttribute(attr.name);
        }
      });
      if (node.tagName.toLowerCase() === "img" && !node.hasAttribute("loading")) {
        node.setAttribute("loading", "lazy");
      }
      if (node.tagName.toLowerCase() === "a" && node.getAttribute("target") === "_blank" && !node.getAttribute("rel")) {
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    return doc.body.innerHTML.trim();
  }

  function articleHtmlSource() {
    const body = sanitizeArticleHtml(fields.body.value).trim();
    return `${frontMatter()}${body}\n`;
  }

  function tagHtml() {
    const tags = splitTags();
    if (!tags.length) {
      return "";
    }
    return `<div class="tag-row">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
  }

  function updatePreview() {
    updatePaths();
    const cover = fields.image.value.trim();
    const bodyHtml = sanitizeArticleHtml(fields.body.value);
    preview.innerHTML = `
      <article class="article preview-article">
        <header class="article-head">
          <p class="article-kicker">${escapeHtml(fields.date.value.replaceAll("-", "."))}</p>
          <h1>${escapeHtml(fields.title.value || "無題の記事")}</h1>
          ${fields.description.value.trim() ? `<p class="article-lead">${escapeHtml(fields.description.value.trim())}</p>` : ""}
          ${tagHtml()}
        </header>
        ${cover ? `<figure class="eyecatch"><img src="${escapeHtml(cover)}" alt=""></figure>` : ""}
        <div class="article-body">${bodyHtml}</div>
      </article>
    `;
    updateStats(bodyHtml);
    updateChecklist();
  }

  function textFromHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim();
  }

  function updateStats(html) {
    const chars = textFromHtml(html || fields.body.value).length;
    charCount.textContent = String(chars);
    imageCount.textContent = String(assets.length);
    readTime.textContent = String(Math.max(1, Math.ceil(chars / 600)));
  }

  function checklistItem(ok, text) {
    return `<li class="${ok ? "ok" : "warn"}"><span>${ok ? "OK" : "!"}</span>${escapeHtml(text)}</li>`;
  }

  function updateChecklist() {
    const hasLocalCover = !fields.image.value.trim() || fields.image.value.startsWith(publicArticleFolder()) || fields.image.value.startsWith("/");
    const bodyTextLength = textFromHtml(fields.body.value).length;
    const checks = [
      [fields.title.value.trim().length >= 4, "タイトルが入っている"],
      [fields.description.value.trim().length >= 50 && fields.description.value.trim().length <= 160, "説明文が50-160文字"],
      [slugify(fields.slug.value) === fields.slug.value.trim() || fields.slug.value.trim().length > 0, "スラッグが設定済み"],
      [bodyTextLength >= 80, "本文が80文字以上"],
      [splitTags().length > 0, "タグが1つ以上"],
      [hasLocalCover, "アイキャッチ画像パスを確認"],
      [articleHtmlSource().includes("blog_article: true"), "HTML記事設定あり"]
    ];
    publishChecklist.innerHTML = checks.map(([ok, text]) => checklistItem(ok, text)).join("");
  }

  function setStatus(element, message) {
    element.textContent = message;
  }

  function draftData() {
    return {
      title: fields.title.value,
      date: fields.date.value,
      slug: fields.slug.value,
      description: fields.description.value,
      tags: fields.tags.value,
      image: fields.image.value,
      body: fields.body.value,
      savedAt: new Date().toISOString()
    };
  }

  function saveDraft(showMessage) {
    localStorage.setItem(draftKey, JSON.stringify(draftData()));
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    draftSaved.textContent = `下書き保存済み ${time}`;
    if (showMessage) {
      setStatus(draftStatus, "下書きを保存しました。画像ファイル本体はブラウザ仕様上、再読み込み後は選び直してください。");
    }
  }

  function scheduleDraftSave() {
    draftSaved.textContent = "下書き保存中...";
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => saveDraft(false), 700);
  }

  function loadDraft() {
    const raw = localStorage.getItem(draftKey);
    if (!raw) {
      setStatus(draftStatus, "保存された下書きはありません。");
      return;
    }
    const data = JSON.parse(raw);
    Object.keys(data).forEach((key) => {
      if (fields[key]) {
        fields[key].value = data[key] || "";
      }
    });
    updatePreview();
    setStatus(draftStatus, "下書きを復元しました。");
    draftSaved.textContent = "下書き復元済み";
  }

  function clearDraft() {
    localStorage.removeItem(draftKey);
    setStatus(draftStatus, "下書きを削除しました。");
    draftSaved.textContent = "下書きなし";
  }

  function insertAtCursor(textarea, insert, before, after) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const value = before ? `${before}${selected || "text"}${after || ""}` : insert;
    textarea.setRangeText(value, start, end, "end");
    textarea.focus();
    updatePreview();
    scheduleDraftSave();
  }

  function downloadBlob(blob, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function addFiles(fileList) {
    Array.from(fileList || []).forEach((file) => {
      const name = uniqueAssetName(file.name);
      const asset = {
        id: window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        file,
        name,
        url: URL.createObjectURL(file),
        alt: fields.title.value || "記事画像"
      };
      assets.push(asset);
    });
    renderAssets();
    updatePreview();
    scheduleDraftSave();
    setStatus(imageStatus, `${assets.length} 個の画像を管理中です。`);
  }

  function renderAssets() {
    if (!assets.length) {
      assetList.innerHTML = '<p class="empty-state">画像を選ぶとここに並びます。</p>';
      return;
    }

    assetList.innerHTML = assets.map((asset) => `
      <article class="asset-item" data-id="${asset.id}">
        <img src="${asset.url}" alt="">
        <div>
          <strong>${escapeHtml(asset.name)}</strong>
          <code>${escapeHtml(assetPublicPath(asset))}</code>
          <input type="text" value="${escapeHtml(asset.alt)}" aria-label="Alt text">
          <div class="asset-actions">
            <button type="button" data-action="insert">挿入</button>
            <button type="button" data-action="cover">表紙</button>
            <button type="button" data-action="download">保存</button>
            <button type="button" data-action="remove">削除</button>
          </div>
        </div>
      </article>
    `).join("");
  }

  function assetById(id) {
    return assets.find((asset) => asset.id === id);
  }

  function handleAssetAction(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }
    const item = button.closest(".asset-item");
    const asset = assetById(item.dataset.id);
    if (!asset) {
      return;
    }
    const input = item.querySelector("input");
    asset.alt = input.value.trim() || "画像";

    if (button.dataset.action === "insert") {
      insertAtCursor(fields.body, `<figure>\n  <img loading="lazy" src="${assetPublicPath(asset)}" alt="${escapeHtml(asset.alt)}">\n  <figcaption>${escapeHtml(asset.alt)}</figcaption>\n</figure>`, "", "");
      setStatus(imageStatus, `${asset.name} を本文に挿入しました。`);
    } else if (button.dataset.action === "cover") {
      fields.image.value = assetPublicPath(asset);
      updatePreview();
      scheduleDraftSave();
      setStatus(imageStatus, `${asset.name} をアイキャッチに設定しました。`);
    } else if (button.dataset.action === "download") {
      downloadBlob(asset.file, asset.name);
    } else if (button.dataset.action === "remove") {
      URL.revokeObjectURL(asset.url);
      assets = assets.filter((candidate) => candidate.id !== asset.id);
      renderAssets();
      updatePreview();
      scheduleDraftSave();
    }
  }

  function downloadArticleOnly() {
    downloadBlob(new Blob([articleHtmlSource()], { type: "text/html;charset=utf-8" }), "index.html");
    setStatus(exportStatus, `index.html を書き出しました。${articleFolder()} に配置してください。`);
    saveDraft(false);
  }

  async function copyArticle() {
    await navigator.clipboard.writeText(articleHtmlSource());
    setStatus(exportStatus, "HTML全文をクリップボードにコピーしました。");
  }

  function crc32(bytes) {
    let crc = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let j = 0; j < 8; j += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ -1) >>> 0;
  }

  function u16(value) {
    return [value & 255, (value >>> 8) & 255];
  }

  function u32(value) {
    return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
  }

  function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  async function createZip(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const now = dosDateTime(new Date());

    for (const file of files) {
      const nameBytes = encoder.encode(file.path.replace(/\\/g, "/"));
      const data = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(await file.bytes.arrayBuffer());
      const crc = crc32(data);
      const localHeader = new Uint8Array([
        ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(now.time), ...u16(now.day),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0)
      ]);
      localParts.push(localHeader, nameBytes, data);

      const centralHeader = new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(now.time), ...u16(now.day),
        ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameBytes.length), ...u16(0), ...u16(0),
        ...u16(0), ...u16(0), ...u32(0), ...u32(offset)
      ]);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + data.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0)
    ]);
    return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
  }

  async function articleFiles() {
    const folder = articleFolderName();
    const files = [{
      path: `${folder}/index.html`,
      bytes: encoder.encode(articleHtmlSource())
    }];

    for (const asset of assets) {
      files.push({
        path: `${folder}/${asset.name}`,
        bytes: asset.file
      });
    }
    return files;
  }

  async function exportZip() {
    const zip = await createZip(await articleFiles());
    downloadBlob(zip, `${articleFolderName()}.zip`);
    setStatus(exportStatus, `${articleFolderName()}.zip を書き出しました。解凍したフォルダを blog/articles に置いてください。`);
    saveDraft(false);
  }

  async function saveFolder() {
    if (!window.showDirectoryPicker) {
      setStatus(exportStatus, "このブラウザはフォルダ保存に未対応です。ZIP書き出しを使ってください。");
      return;
    }
    const root = await window.showDirectoryPicker();
    const dir = await root.getDirectoryHandle(articleFolderName(), { create: true });
    const indexHandle = await dir.getFileHandle("index.html", { create: true });
    const indexWritable = await indexHandle.createWritable();
    await indexWritable.write(articleHtmlSource());
    await indexWritable.close();

    for (const asset of assets) {
      const handle = await dir.getFileHandle(asset.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(asset.file);
      await writable.close();
    }

    setStatus(exportStatus, `${articleFolderName()} フォルダを書き出しました。blog/articles に配置してください。`);
    saveDraft(false);
  }

  function importFullHtml(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const meta = (selector) => doc.querySelector(selector)?.getAttribute("content")?.trim() || "";
    const text = (selector) => doc.querySelector(selector)?.textContent?.trim() || "";
    const title = meta('meta[property="og:title"]') || text(".article-head h1") || text("h1") || text("title").replace(/\s*\|.*$/, "");
    const description = meta('meta[name="description"]') || meta('meta[property="og:description"]') || text(".article-lead");
    const date = meta('meta[property="article:published_time"]').slice(0, 10) || text(".article-kicker").replaceAll(".", "-");
    const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || meta('meta[property="og:url"]');
    const image = meta('meta[property="og:image"]').replace(/^https:\/\/xenoah\.github\.io/, "");
    const tags = Array.from(doc.querySelectorAll('meta[property="article:tag"]')).map((node) => node.getAttribute("content")).filter(Boolean);
    const body = doc.querySelector(".article-body") || doc.body;

    if (title) fields.title.value = title;
    if (description) fields.description.value = description;
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) fields.date.value = date;
    if (image) fields.image.value = image;
    if (tags.length) fields.tags.value = tags.join(", ");
    if (canonical) {
      const url = canonical.replace(/^https:\/\/xenoah\.github\.io/, "");
      const parts = url.split("/").filter(Boolean);
      fields.slug.value = parts[parts.length - 1] || fields.slug.value;
      fields.slug.dataset.touched = "true";
    }
    fields.body.value = sanitizeArticleHtml(body.innerHTML);
  }

  function parseFrontMatter(html) {
    html = String(html || "").replace(/^\uFEFF/, "");
    const match = html.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      importFullHtml(html);
      return;
    }
    const yaml = match[1];
    fields.body.value = sanitizeArticleHtml(html.slice(match[0].length));
    const read = (key) => {
      const found = yaml.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?\\s*$`, "m"));
      return found ? found[1].trim() : "";
    };
    fields.title.value = read("title") || fields.title.value;
    fields.date.value = read("date") || fields.date.value;
    fields.description.value = read("description") || fields.description.value;
    fields.image.value = read("image") || fields.image.value;
    const tagsBlock = yaml.match(/^tags:\s*\n((?:\s+-\s+.+\n?)+)/m);
    if (tagsBlock) {
      fields.tags.value = tagsBlock[1].split(/\r?\n/).map((line) => line.replace(/^\s+-\s+/, "").replace(/^"|"$/g, "").trim()).filter(Boolean).join(", ");
    }
    const permalink = read("permalink");
    if (permalink) {
      const parts = permalink.split("/").filter(Boolean);
      fields.slug.value = parts[parts.length - 1] || fields.slug.value;
      fields.slug.dataset.touched = "true";
    }
  }

  async function importHtmlFile() {
    const file = fields.importHtmlFile.files && fields.importHtmlFile.files[0];
    if (!file) return;
    parseFrontMatter(await file.text());
    updatePreview();
    scheduleDraftSave();
    setStatus(draftStatus, `${file.name} を読み込みました。`);
  }

  function applyHtmlInput(mode) {
    const html = sanitizeArticleHtml(fields.htmlInput.value);
    if (!textFromHtml(html) && !/<img|<iframe|<figure/i.test(html)) {
      setStatus(htmlStatus, "取り込めるHTMLがありません。");
      return;
    }
    if (mode === "replace") {
      fields.body.value = html;
    } else {
      fields.body.value = `${fields.body.value.trim()}\n\n${html}`.trim();
    }
    updatePreview();
    scheduleDraftSave();
    setStatus(htmlStatus, "HTMLを本文へ取り込みました。プレビューで崩れがないか確認してください。");
  }

  function folderTree() {
    const names = ["index.html", ...assets.map((asset) => asset.name)];
    return `${articleFolderName()}/\n${names.map((name, index) => `${index === names.length - 1 ? "`-" : "|-"} ${name}`).join("\n")}`;
  }

  async function copyText(text, statusElement, message) {
    await navigator.clipboard.writeText(text);
    setStatus(statusElement, message);
  }

  function bindChangeEvents() {
    [fields.date, fields.description, fields.tags, fields.image, fields.body].forEach((field) => {
      field.addEventListener("input", () => {
        updatePreview();
        scheduleDraftSave();
      });
    });
    fields.title.addEventListener("input", () => {
      if (!fields.slug.dataset.touched) {
        fields.slug.value = slugify(fields.title.value);
      }
      updatePreview();
      scheduleDraftSave();
    });
    fields.slug.addEventListener("input", () => {
      fields.slug.dataset.touched = "true";
      updatePreview();
      scheduleDraftSave();
    });
  }

  document.querySelectorAll("[data-insert], [data-before]").forEach((button) => {
    button.addEventListener("click", () => {
      insertAtCursor(fields.body, button.dataset.insert || "", button.dataset.before, button.dataset.after);
    });
  });

  bindChangeEvents();
  fields.imageFiles.addEventListener("change", () => addFiles(fields.imageFiles.files));
  fields.importHtmlFile.addEventListener("change", () => importHtmlFile().catch((error) => setStatus(draftStatus, error.message)));
  assetList.addEventListener("click", handleAssetAction);
  assetList.addEventListener("input", (event) => {
    const item = event.target.closest(".asset-item");
    const asset = item && assetById(item.dataset.id);
    if (asset) {
      asset.alt = event.target.value.trim();
      scheduleDraftSave();
    }
  });

  $("exportFolderBtn").addEventListener("click", () => exportZip().catch((error) => setStatus(exportStatus, error.message)));
  $("saveFolderBtn").addEventListener("click", () => saveFolder().catch((error) => setStatus(exportStatus, error.message)));
  $("downloadBtn").addEventListener("click", downloadArticleOnly);
  $("copyBtn").addEventListener("click", () => copyArticle().catch((error) => setStatus(exportStatus, error.message)));
  $("saveDraftBtn").addEventListener("click", () => saveDraft(true));
  $("loadDraftBtn").addEventListener("click", () => {
    try {
      loadDraft();
    } catch (error) {
      setStatus(draftStatus, error.message);
    }
  });
  $("clearDraftBtn").addEventListener("click", clearDraft);
  $("convertHtmlReplaceBtn").addEventListener("click", () => applyHtmlInput("replace"));
  $("convertHtmlAppendBtn").addEventListener("click", () => applyHtmlInput("append"));
  $("copyPermalinkBtn").addEventListener("click", () => copyText(`https://xenoah.github.io${publicPermalink()}`, checkStatus, "公開URLをコピーしました。"));
  $("copyTreeBtn").addEventListener("click", () => copyText(folderTree(), checkStatus, "フォルダ構成をコピーしました。"));

  if (localStorage.getItem(draftKey)) {
    draftSaved.textContent = "保存済み下書きあり";
    setStatus(draftStatus, "前回の下書きがあります。復元ボタンで読み込めます。");
  }

  renderAssets();
  updatePreview();
  previewStatus.textContent = "リアルタイム";
})();
