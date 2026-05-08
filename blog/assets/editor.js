(function () {
  const $ = (id) => document.getElementById(id);
  const draftKey = "xenoah_blog_editor_draft_v3";
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
    owner: $("owner"),
    repo: $("repo"),
    branch: $("branch"),
    token: $("token"),
    imageFiles: $("imageFiles"),
    importMdFile: $("importMdFile"),
    htmlInput: $("htmlInput")
  };

  const exportStatus = $("exportStatus");
  const uploadStatus = $("uploadStatus");
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
  fields.token.value = localStorage.getItem("xenoah_blog_github_token") || "";

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
    return `${articleFolder()}index.md`;
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

  function articleMarkdown() {
    return `${frontMatter()}${fields.body.value.trim()}\n`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function inlineMarkdown(value) {
    let html = escapeHtml(value);
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img loading="lazy" src="$2" alt="$1">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return html;
  }

  function renderMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const html = [];
    let inCode = false;
    let code = [];
    let inList = false;
    let inOrderedList = false;
    let table = [];

    function closeLists() {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      if (inOrderedList) {
        html.push("</ol>");
        inOrderedList = false;
      }
    }

    function flushTable() {
      if (!table.length) {
        return;
      }
      const rows = table
        .filter((line) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line))
        .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => inlineMarkdown(cell.trim())));
      if (rows.length) {
        html.push("<table>");
        rows.forEach((row, index) => {
          html.push(index === 0 ? "<thead><tr>" : index === 1 ? "<tbody><tr>" : "<tr>");
          row.forEach((cell) => html.push(index === 0 ? `<th>${cell}</th>` : `<td>${cell}</td>`));
          html.push(index === 0 ? "</tr></thead>" : "</tr>");
        });
        if (rows.length > 1) {
          html.push("</tbody>");
        }
        html.push("</table>");
      }
      table = [];
    }

    lines.forEach((line) => {
      if (line.startsWith("```")) {
        flushTable();
        if (inCode) {
          html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
          code = [];
          inCode = false;
        } else {
          closeLists();
          inCode = true;
        }
        return;
      }

      if (inCode) {
        code.push(line);
        return;
      }

      if (/^\|.+\|$/.test(line.trim())) {
        closeLists();
        table.push(line.trim());
        return;
      }

      flushTable();

      if (/^###\s+/.test(line)) {
        closeLists();
        html.push(`<h3>${inlineMarkdown(line.replace(/^###\s+/, ""))}</h3>`);
      } else if (/^##\s+/.test(line)) {
        closeLists();
        html.push(`<h2>${inlineMarkdown(line.replace(/^##\s+/, ""))}</h2>`);
      } else if (/^#\s+/.test(line)) {
        closeLists();
        html.push(`<h1>${inlineMarkdown(line.replace(/^#\s+/, ""))}</h1>`);
      } else if (/^>\s?/.test(line)) {
        closeLists();
        html.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s?/, ""))}</blockquote>`);
      } else if (/^-\s+/.test(line)) {
        if (!inList) {
          closeLists();
          html.push("<ul>");
          inList = true;
        }
        html.push(`<li>${inlineMarkdown(line.replace(/^-\s+/, ""))}</li>`);
      } else if (/^\d+\.\s+/.test(line)) {
        if (!inOrderedList) {
          closeLists();
          html.push("<ol>");
          inOrderedList = true;
        }
        html.push(`<li>${inlineMarkdown(line.replace(/^\d+\.\s+/, ""))}</li>`);
      } else if (line.trim() === "") {
        closeLists();
      } else {
        closeLists();
        html.push(`<p>${inlineMarkdown(line)}</p>`);
      }
    });

    flushTable();
    closeLists();
    return html.join("\n");
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
    preview.innerHTML = `
      <article class="article preview-article">
        <header class="article-head">
          <p class="article-kicker">${escapeHtml(fields.date.value.replaceAll("-", "."))}</p>
          <h1>${escapeHtml(fields.title.value || "無題の記事")}</h1>
          ${fields.description.value.trim() ? `<p class="article-lead">${escapeHtml(fields.description.value.trim())}</p>` : ""}
          ${tagHtml()}
        </header>
        ${cover ? `<figure class="eyecatch"><img src="${escapeHtml(cover)}" alt=""></figure>` : ""}
        <div class="article-body">${renderMarkdown(fields.body.value)}</div>
      </article>
    `;
    updateStats();
    updateChecklist();
  }

  function updateStats() {
    const plain = fields.body.value.replace(/[#>*_`[\]()!-]/g, "").trim();
    const chars = plain.length;
    charCount.textContent = String(chars);
    imageCount.textContent = String(assets.length);
    readTime.textContent = String(Math.max(1, Math.ceil(chars / 600)));
  }

  function checklistItem(ok, text) {
    return `<li class="${ok ? "ok" : "warn"}"><span>${ok ? "OK" : "!"}</span>${escapeHtml(text)}</li>`;
  }

  function updateChecklist() {
    const hasLocalCover = !fields.image.value.trim() || fields.image.value.startsWith(publicArticleFolder()) || fields.image.value.startsWith("/");
    const checks = [
      [fields.title.value.trim().length >= 4, "タイトルが入っている"],
      [fields.description.value.trim().length >= 50 && fields.description.value.trim().length <= 160, "説明文が50-160文字"],
      [slugify(fields.slug.value) === fields.slug.value.trim() || fields.slug.value.trim().length > 0, "スラッグが設定済み"],
      [fields.body.value.trim().length >= 80, "本文が80文字以上"],
      [splitTags().length > 0, "タグが1つ以上"],
      [hasLocalCover, "アイキャッチ画像パスを確認"],
      [articleMarkdown().includes("blog_article: true"), "フォルダ記事設定あり"]
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

  function insertAtCursor(textarea, insert, wrap) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const value = wrap ? `${wrap}${selected || "text"}${wrap}` : insert;
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
      insertAtCursor(fields.body, `![${asset.alt}](${assetPublicPath(asset)})`, "");
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
    downloadBlob(new Blob([articleMarkdown()], { type: "text/markdown;charset=utf-8" }), "index.md");
    setStatus(exportStatus, `index.md を書き出しました。${articleFolder()} に配置してください。`);
    saveDraft(false);
  }

  async function copyArticle() {
    await navigator.clipboard.writeText(articleMarkdown());
    setStatus(exportStatus, "Markdown全文をクリップボードにコピーしました。");
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
      path: `${folder}/index.md`,
      bytes: encoder.encode(articleMarkdown())
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
    const indexHandle = await dir.getFileHandle("index.md", { create: true });
    const indexWritable = await indexHandle.createWritable();
    await indexWritable.write(articleMarkdown());
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

  function markdownEscape(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function htmlToMarkdown(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript,iframe").forEach((node) => node.remove());

    function inline(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.nodeValue.replace(/\s+/g, " ");
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }
      const tag = node.tagName.toLowerCase();
      const text = Array.from(node.childNodes).map(inline).join("");
      if (tag === "strong" || tag === "b") return `**${text.trim()}**`;
      if (tag === "em" || tag === "i") return `*${text.trim()}*`;
      if (tag === "code") return `\`${node.textContent.trim()}\``;
      if (tag === "br") return "\n";
      if (tag === "a") {
        const href = node.getAttribute("href") || "";
        return href ? `[${text.trim() || href}](${href})` : text;
      }
      if (tag === "img") {
        const src = node.getAttribute("src") || "";
        const alt = node.getAttribute("alt") || "画像";
        return src ? `![${alt}](${src})` : "";
      }
      return text;
    }

    function block(node, depth) {
      if (node.nodeType === Node.TEXT_NODE) {
        return markdownEscape(node.nodeValue);
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }

      const tag = node.tagName.toLowerCase();
      const children = () => Array.from(node.childNodes).map((child) => block(child, depth)).filter(Boolean).join("\n\n");
      const text = markdownEscape(inline(node));

      if (/^h[1-6]$/.test(tag)) {
        return `${"#".repeat(Number(tag[1]))} ${text}`;
      }
      if (tag === "p") {
        return text;
      }
      if (tag === "pre") {
        return `\`\`\`\n${node.textContent.replace(/\n+$/, "")}\n\`\`\``;
      }
      if (tag === "blockquote") {
        return children().split("\n").map((line) => `> ${line}`).join("\n");
      }
      if (tag === "ul" || tag === "ol") {
        return Array.from(node.children)
          .filter((child) => child.tagName && child.tagName.toLowerCase() === "li")
          .map((li, index) => {
            const marker = tag === "ol" ? `${index + 1}.` : "-";
            return `${"  ".repeat(depth)}${marker} ${markdownEscape(inline(li))}`;
          })
          .join("\n");
      }
      if (tag === "table") {
        const rows = Array.from(node.querySelectorAll("tr")).map((tr) =>
          Array.from(tr.children).map((cell) => markdownEscape(inline(cell)))
        ).filter((row) => row.length);
        if (!rows.length) return "";
        const header = rows[0];
        const separator = header.map(() => "---");
        return [header, separator, ...rows.slice(1)].map((row) => `| ${row.join(" | ")} |`).join("\n");
      }
      if (tag === "figure") {
        return children();
      }
      if (tag === "figcaption") {
        return text ? `*${text}*` : "";
      }
      if (tag === "img") {
        return inline(node);
      }
      if (tag === "hr") {
        return "---";
      }
      if (["div", "section", "article", "main", "body"].includes(tag)) {
        return children();
      }
      return text || children();
    }

    return Array.from(doc.body.childNodes).map((node) => block(node, 0)).filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function convertHtml(mode) {
    const markdown = htmlToMarkdown(fields.htmlInput.value);
    if (!markdown) {
      setStatus(htmlStatus, "変換できるHTMLがありません。");
      return;
    }
    if (mode === "replace") {
      fields.body.value = markdown;
    } else {
      fields.body.value = `${fields.body.value.trim()}\n\n${markdown}`.trim();
    }
    updatePreview();
    scheduleDraftSave();
    setStatus(htmlStatus, "HTMLをMarkdownへ変換しました。プレビューで崩れがないか確認してください。");
  }

  function parseFrontMatter(markdown) {
    const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) {
      fields.body.value = markdown;
      return;
    }
    const yaml = match[1];
    fields.body.value = markdown.slice(match[0].length);
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

  async function importMarkdownFile() {
    const file = fields.importMdFile.files && fields.importMdFile.files[0];
    if (!file) return;
    parseFrontMatter(await file.text());
    updatePreview();
    scheduleDraftSave();
    setStatus(draftStatus, `${file.name} を読み込みました。`);
  }

  function folderTree() {
    const names = ["index.md", ...assets.map((asset) => asset.name)];
    return `${articleFolderName()}/\n${names.map((name, index) => `${index === names.length - 1 ? "`-" : "|-"} ${name}`).join("\n")}`;
  }

  async function copyText(text, statusElement, message) {
    await navigator.clipboard.writeText(text);
    setStatus(statusElement, message);
  }

  function toBase64Utf8(value) {
    const bytes = encoder.encode(value);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const value = String(reader.result || "");
        resolve(value.includes(",") ? value.split(",")[1] : value);
      });
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(file);
    });
  }

  async function uploadContent(owner, repo, branch, token, path, content, message) {
    const baseUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };

    let sha;
    const getResponse = await fetch(`${baseUrl}?ref=${encodeURIComponent(branch)}`, { headers });
    if (getResponse.ok) {
      const existing = await getResponse.json();
      sha = existing.sha;
    } else if (getResponse.status !== 404) {
      throw new Error(`GitHub確認に失敗しました: ${getResponse.status}`);
    }

    const putResponse = await fetch(baseUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ message, content, branch, sha })
    });

    if (!putResponse.ok) {
      const error = await putResponse.json().catch(() => ({}));
      throw new Error(error.message || `GitHubアップロードに失敗しました: ${putResponse.status}`);
    }
  }

  async function uploadArticle() {
    const owner = fields.owner.value.trim();
    const repo = fields.repo.value.trim();
    const branch = fields.branch.value.trim() || "main";
    const token = fields.token.value.trim();

    if (!owner || !repo || !token) {
      setStatus(uploadStatus, "Owner、Repository、GitHub tokenを入力してください。");
      return;
    }

    setStatus(uploadStatus, `${articleIndexPath()} をアップロードしています...`);
    await uploadContent(owner, repo, branch, token, articleIndexPath(), toBase64Utf8(articleMarkdown()), `add blog article: ${fields.title.value}`);

    for (const asset of assets) {
      setStatus(uploadStatus, `${articleFolder()}${asset.name} をアップロードしています...`);
      await uploadContent(owner, repo, branch, token, `${articleFolder()}${asset.name}`, await fileToBase64(asset.file), `add blog image: ${asset.name}`);
    }

    setStatus(uploadStatus, `${articleFolder()} をアップロードしました。GitHub Pagesの反映まで少し待ってください。`);
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

  document.querySelectorAll("[data-insert], [data-wrap], [data-codeblock]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.codeblock) {
        insertAtCursor(fields.body, "```js\nconsole.log(\"hello\");\n```", "");
        return;
      }
      insertAtCursor(fields.body, button.dataset.insert, button.dataset.wrap);
    });
  });

  bindChangeEvents();
  fields.imageFiles.addEventListener("change", () => addFiles(fields.imageFiles.files));
  fields.importMdFile.addEventListener("change", () => importMarkdownFile().catch((error) => setStatus(draftStatus, error.message)));
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
  $("convertHtmlReplaceBtn").addEventListener("click", () => convertHtml("replace"));
  $("convertHtmlAppendBtn").addEventListener("click", () => convertHtml("append"));
  $("copyPermalinkBtn").addEventListener("click", () => copyText(`https://xenoah.github.io${publicPermalink()}`, checkStatus, "公開URLをコピーしました。"));
  $("copyTreeBtn").addEventListener("click", () => copyText(folderTree(), checkStatus, "フォルダ構成をコピーしました。"));
  $("saveTokenBtn").addEventListener("click", () => {
    localStorage.setItem("xenoah_blog_github_token", fields.token.value.trim());
    setStatus(uploadStatus, "Tokenをこのブラウザに保存しました。");
  });
  $("uploadBtn").addEventListener("click", () => uploadArticle().catch((error) => setStatus(uploadStatus, error.message)));

  if (localStorage.getItem(draftKey)) {
    draftSaved.textContent = "保存済み下書きあり";
    setStatus(draftStatus, "前回の下書きがあります。復元ボタンで読み込めます。");
  }

  renderAssets();
  updatePreview();
  previewStatus.textContent = "自動更新中";
})();
