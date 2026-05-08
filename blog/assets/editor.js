(function () {
  const $ = (id) => document.getElementById(id);
  const draftKey = "xenoah_blog_editor_draft_v2";
  let selectedImageFile = null;
  let selectedImageUrl = "";
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
    imageFile: $("imageFile"),
    imageFolder: $("imageFolder"),
    imageName: $("imageName"),
    imageAlt: $("imageAlt")
  };

  const exportStatus = $("exportStatus");
  const uploadStatus = $("uploadStatus");
  const draftStatus = $("draftStatus");
  const draftSaved = $("draftSaved");
  const imageStatus = $("imageStatus");
  const imagePreview = $("imagePreview");
  const articleFolderPath = $("articleFolderPath");
  const postPath = $("postPath");
  const preview = $("preview");

  const today = new Date();
  fields.date.value = today.toISOString().slice(0, 10);
  fields.token.value = localStorage.getItem("xenoah_blog_github_token") || "";

  function slugify(value) {
    return value
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

  function yamlString(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function splitTags() {
    return fields.tags.value
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function filename() {
    return `${fields.date.value}-${slugify(fields.slug.value)}.md`;
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

  function updatePostPath() {
    articleFolderPath.textContent = articleFolder();
    postPath.textContent = articleIndexPath();
    if (!fields.imageFolder.dataset.touched) {
      fields.imageFolder.value = publicArticleFolder();
    }
  }

  function imagePath() {
    const folder = fields.imageFolder.value.trim() || publicArticleFolder();
    const normalizedFolder = folder.endsWith("/") ? folder : `${folder}/`;
    const name = cleanFileName(fields.imageName.value || (selectedImageFile && selectedImageFile.name) || "image.png");
    return `${normalizedFolder}${name}`;
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
      `permalink: /blog/${fields.date.value.slice(0, 4)}/${fields.date.value.slice(5, 7)}/${fields.date.value.slice(8, 10)}/${slugify(fields.slug.value)}/`
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
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img loading="lazy" src="$2" alt="$1">');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" rel="noopener noreferrer">$1</a>');
    return html;
  }

  function renderMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const html = [];
    let inCode = false;
    let code = [];
    let inList = false;
    let inOrderedList = false;

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

    lines.forEach((line) => {
      if (line.startsWith("```")) {
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

    closeLists();
    return html.join("\n");
  }

  function updatePreview() {
    preview.innerHTML = renderMarkdown(fields.body.value);
    updatePostPath();
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
      imageFolder: fields.imageFolder.value,
      imageName: fields.imageName.value,
      imageAlt: fields.imageAlt.value,
      savedAt: new Date().toISOString()
    };
  }

  function saveDraft(showMessage) {
    localStorage.setItem(draftKey, JSON.stringify(draftData()));
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    draftSaved.textContent = `下書き保存済み ${time}`;
    if (showMessage) {
      setStatus(draftStatus, "下書きを保存しました。");
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

  function downloadArticle() {
    const blob = new Blob([articleMarkdown()], { type: "text/markdown;charset=utf-8" });
    downloadBlob(blob, "index.md");
    setStatus(exportStatus, `index.md を書き出しました。${articleFolder()} に配置してください。`);
    saveDraft(false);
  }

  async function copyArticle() {
    await navigator.clipboard.writeText(articleMarkdown());
    setStatus(exportStatus, "Markdown全文をクリップボードにコピーしました。");
  }

  function handleImageFile() {
    selectedImageFile = fields.imageFile.files && fields.imageFile.files[0] ? fields.imageFile.files[0] : null;
    if (!selectedImageFile) {
      return;
    }

    if (selectedImageUrl) {
      URL.revokeObjectURL(selectedImageUrl);
    }
    selectedImageUrl = URL.createObjectURL(selectedImageFile);
    fields.imageName.value = cleanFileName(selectedImageFile.name);
    if (!fields.imageAlt.value) {
      fields.imageAlt.value = fields.title.value || "記事画像";
    }
    imagePreview.innerHTML = `<img src="${selectedImageUrl}" alt="">`;
    setStatus(imageStatus, `${selectedImageFile.name} を選択しました。配置先: ${imagePath()}`);
    scheduleDraftSave();
  }

  function insertImageMarkdown() {
    const path = imagePath();
    const alt = fields.imageAlt.value.trim() || "画像";
    insertAtCursor(fields.body, `![${alt}](${path})`, "");
    setStatus(imageStatus, `本文に ${path} を挿入しました。`);
  }

  function setCoverImage() {
    fields.image.value = imagePath();
    setStatus(imageStatus, `${fields.image.value} をアイキャッチに設定しました。`);
    scheduleDraftSave();
  }

  function downloadSelectedImage() {
    if (!selectedImageFile) {
      setStatus(imageStatus, "先に画像ファイルを選択してください。");
      return;
    }
    downloadBlob(selectedImageFile, cleanFileName(fields.imageName.value || selectedImageFile.name));
    setStatus(imageStatus, `画像を書き出しました。${articleFolder()} に配置してください。`);
  }

  function toBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
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
      body: JSON.stringify({
        message,
        content,
        branch,
        sha
      })
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
    const path = articleIndexPath();

    if (!owner || !repo || !token) {
      setStatus(uploadStatus, "Owner、Repository、GitHub tokenを入力してください。");
      return;
    }

    setStatus(uploadStatus, `${path} を確認しています...`);
    await uploadContent(
      owner,
      repo,
      branch,
      token,
      path,
      toBase64Utf8(articleMarkdown()),
      `add blog article: ${fields.title.value}`
    );

    if (selectedImageFile) {
      const imageRepoPath = `${articleFolder()}${cleanFileName(fields.imageName.value || selectedImageFile.name)}`;
      setStatus(uploadStatus, `${imageRepoPath} をアップロードしています...`);
      await uploadContent(
        owner,
        repo,
        branch,
        token,
        imageRepoPath,
        await fileToBase64(selectedImageFile),
        `add blog image: ${cleanFileName(fields.imageName.value || selectedImageFile.name)}`
      );
    }

    setStatus(uploadStatus, `${articleFolder()} をアップロードしました。GitHub Pagesの反映まで少し待ってください。`);
  }

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
  [fields.date, fields.description, fields.tags, fields.image, fields.imageFolder, fields.imageName, fields.imageAlt].forEach((field) => {
    field.addEventListener("input", () => {
      if (field === fields.imageFolder) {
        fields.imageFolder.dataset.touched = "true";
      }
      updatePreview();
      scheduleDraftSave();
    });
  });
  fields.body.addEventListener("input", () => {
    updatePreview();
    scheduleDraftSave();
  });
  fields.imageFile.addEventListener("change", handleImageFile);

  document.querySelectorAll("[data-insert], [data-wrap], [data-codeblock]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.codeblock) {
        insertAtCursor(fields.body, "```js\nconsole.log(\"hello\");\n```", "");
        return;
      }
      insertAtCursor(fields.body, button.dataset.insert, button.dataset.wrap);
    });
  });

  $("downloadBtn").addEventListener("click", downloadArticle);
  $("copyBtn").addEventListener("click", () => {
    copyArticle().catch((error) => setStatus(exportStatus, error.message));
  });
  $("saveDraftBtn").addEventListener("click", () => saveDraft(true));
  $("loadDraftBtn").addEventListener("click", () => {
    try {
      loadDraft();
    } catch (error) {
      setStatus(draftStatus, error.message);
    }
  });
  $("clearDraftBtn").addEventListener("click", clearDraft);
  $("insertImageBtn").addEventListener("click", insertImageMarkdown);
  $("setCoverBtn").addEventListener("click", setCoverImage);
  $("downloadImageBtn").addEventListener("click", downloadSelectedImage);
  $("saveTokenBtn").addEventListener("click", () => {
    localStorage.setItem("xenoah_blog_github_token", fields.token.value.trim());
    setStatus(uploadStatus, "Tokenをこのブラウザに保存しました。");
  });
  $("uploadBtn").addEventListener("click", () => {
    uploadArticle().catch((error) => setStatus(uploadStatus, error.message));
  });

  if (localStorage.getItem(draftKey)) {
    draftSaved.textContent = "保存済み下書きあり";
    setStatus(draftStatus, "前回の下書きがあります。復元ボタンで読み込めます。");
  }

  updatePreview();
  updatePostPath();
})();
