/* 記事ソースの読み書き。公開規則は blog/articles の既存記事に合わせる。 */
(function (root) {
  "use strict";
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
  const slugify = (value) => String(value || "").normalize("NFKC").toLowerCase().trim()
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "article";
  const localDate = () => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  };
  const folderName = (data) => `${data.date || localDate()}-${slugify(data.slug)}`;
  const folderPath = (data) => `/blog/articles/${folderName(data)}/`;
  const permalink = (data) => `/blog/${(data.date || localDate()).replaceAll("-", "/")}/${slugify(data.slug)}/`;
  function safeUrl(value, image = false) {
    const url = String(value || "").trim();
    if (!url || /[\u0000-\u0020\u007f\\]/.test(url)) return "";
    if (image && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/=]+$/i.test(url)) return url;
    if (/^(?:\/(?!\/)|\.{1,2}\/|#)/.test(url)) return url;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("//")) return url;
    try {
      const parsed = new URL(url);
      return (image ? ["http:", "https:"] : ["http:", "https:", "mailto:", "tel:"]).includes(parsed.protocol) ? url : "";
    } catch { return ""; }
  }
  function youtubeUrl(value) {
    try {
      const url = new URL(value);
      if (!["https:", "http:"].includes(url.protocol)) return "";
      let id = "";
      if (["youtu.be", "www.youtu.be"].includes(url.hostname)) id = url.pathname.slice(1);
      if (["youtube.com", "www.youtube.com", "m.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname)) {
        id = url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || "";
      }
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}?rel=0` : "";
    } catch { return ""; }
  }
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    doc.querySelectorAll("script,style,noscript,template,object,embed,form,input,button,textarea,select,svg,math,link,meta,base").forEach((node) => node.remove());
    const tags = new Set("p div span br h1 h2 h3 h4 h5 h6 strong b em i u s del mark small sub sup a img figure figcaption ul ol li blockquote pre code hr table thead tbody tfoot tr th td caption colgroup col details summary iframe video audio source".split(" "));
    const attrs = new Set("class id title alt href src width height colspan rowspan scope start reversed type controls loop muted poster preload open".split(" "));
    for (const node of Array.from(doc.body.querySelectorAll("*"))) {
      if (!node.parentNode) continue;
      if (!tags.has(node.localName)) { node.replaceWith(...node.childNodes); continue; }
      const styles = {};
      for (const prop of ["color", "background-color", "font-weight", "font-style", "text-decoration", "text-align"]) {
        if (node.style[prop]) styles[prop] = node.style[prop];
      }
      const background = node.style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      if (background && safeUrl(background, true)) styles["background-image"] = `url("${safeUrl(background, true).replace(/"/g, "%22")}")`;
      const blank = node.getAttribute("target") === "_blank";
      const rel = node.getAttribute("rel") || "";
      for (const attr of Array.from(node.attributes)) if (!attrs.has(attr.name)) node.removeAttribute(attr.name);
      for (const [prop, value] of Object.entries(styles)) node.style.setProperty(prop, value);
      for (const attr of ["href", "src", "poster"]) {
        if (node.hasAttribute(attr)) {
          const url = safeUrl(node.getAttribute(attr), attr !== "href");
          if (url) node.setAttribute(attr, url); else node.removeAttribute(attr);
        }
      }
      if (node.localName === "iframe") {
        const url = youtubeUrl(node.getAttribute("src"));
        if (!url) { node.remove(); continue; }
        node.setAttribute("src", url);
        node.setAttribute("title", node.getAttribute("title") || "YouTube動画");
        node.setAttribute("loading", "lazy");
        node.setAttribute("allowfullscreen", "");
        node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
      }
      if (node.localName === "img") node.setAttribute("loading", "lazy");
      if (node.localName === "a" && blank) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", [...new Set(["noopener", "noreferrer", ...rel.split(/\s+/).filter((x) => ["nofollow", "ugc", "sponsored"].includes(x))])].join(" "));
      }
    }
    const walker = doc.createTreeWalker(doc.body, 128);
    const comments = [];
    while (walker.nextNode()) comments.push(walker.currentNode);
    comments.forEach((node) => node.remove());
    return doc.body.innerHTML.trim();
  }
  function textFromHtml(html) {
    return (new DOMParser().parseFromString(html, "text/html").body.textContent || "").replace(/\s+/g, " ").trim();
  }
  function yamlValue(value) {
    value = value.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try { return JSON.parse(value); } catch { return value.slice(1, -1); }
    }
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    return value.replace(/\s+#.*$/, "").trim();
  }
  function parseArticle(source) {
    source = String(source || "").replace(/^\uFEFF/, "");
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    const data = {};
    let body;
    if (match) {
      let currentList = null;
      for (const line of match[1].split(/\r?\n/)) {
        const item = line.match(/^\s+-\s+(.+)$/);
        if (item && currentList) { data[currentList].push(yamlValue(item[1])); continue; }
        const pair = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
        if (!pair || ["__proto__", "constructor", "prototype"].includes(pair[1])) continue;
        currentList = null;
        if (!pair[2].trim()) { data[pair[1]] = []; currentList = pair[1]; }
        else if (pair[1] === "tags" && /^\[.*\]$/.test(pair[2].trim())) {
          data.tags = pair[2].trim().slice(1, -1).split(",").map(yamlValue).filter(Boolean);
        } else data[pair[1]] = yamlValue(pair[2]);
      }
      body = source.slice(match[0].length);
    } else {
      const doc = new DOMParser().parseFromString(source, "text/html");
      const meta = (key) => doc.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.content || "";
      const text = (selector) => doc.querySelector(selector)?.textContent?.trim() || "";
      data.title = text(".article-head h1") || text("h1") || meta("og:title") || text("title").replace(/\s*\|.*$/, "");
      data.description = text(".article-lead") || meta("description") || meta("og:description");
      data.date = meta("article:published_time").slice(0, 10) || text(".article-kicker").replaceAll(".", "-");
      data.image = doc.querySelector(".eyecatch img")?.getAttribute("src") || meta("og:image");
      data.permalink = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || meta("og:url");
      data.tags = Array.from(doc.querySelectorAll('meta[property="article:tag"]')).map((node) => node.content);
      body = (doc.querySelector(".article-body") || doc.body).innerHTML;
    }
    let slug = data.permalink?.split("/").filter(Boolean).pop() || "article";
    try { slug = decodeURIComponent(slug); } catch { /* retain legacy slug */ }
    return { ...data, slug, body: sanitize(body), tags: Array.isArray(data.tags) ? data.tags.join(", ") : String(data.tags || "") };
  }
  function articleSource(data) {
    const scalar = (key, value) => `${key}: ${JSON.stringify(String(value || ""))}`;
    const lines = ["---", "layout: post", "blog_article: true", scalar("title", data.title)];
    if (data.title_en) lines.push(scalar("title_en", data.title_en));
    lines.push(`date: ${data.date}`, scalar("description", data.description));
    if (data.description_en) lines.push(scalar("description_en", data.description_en));
    lines.push(`permalink: ${permalink(data)}`);
    if (safeUrl(data.image, true)) lines.push(scalar("image", safeUrl(data.image, true)));
    const tags = String(data.tags || "").split(/[,、]/).map((tag) => tag.trim()).filter(Boolean);
    if (tags.length) lines.push("tags:", ...tags.map((tag) => `  - ${JSON.stringify(tag)}`));
    for (const key of ["author", "robots", "last_modified_at"]) if (data[key]) lines.push(scalar(key, data[key]));
    return `${lines.join("\n")}\n---\n\n${sanitize(data.body)}\n`;
  }
  function crc32(bytes) {
    let crc = -1;
    for (const byte of bytes) {
      crc ^= byte;
      for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ -1) >>> 0;
  }
  const u16 = (value) => [value & 255, (value >>> 8) & 255];
  const u32 = (value) => [...u16(value), ...u16(value >>> 16)];
  async function createZip(files) {
    const local = [], central = [], encoder = new TextEncoder();
    let offset = 0;
    const now = new Date();
    const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const file of files) {
      if (file.path.split(/[\\/]/).some((p) => p === "..") || /^[\\/]/.test(file.path)) throw new Error("保存先が不正です。");
      const name = encoder.encode(file.path.replace(/\\/g, "/"));
      const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(await file.bytes.arrayBuffer());
      const crc = crc32(bytes);
      // UTF-8フラグで日本語のフォルダ名・画像名も維持する。
      const header = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(name.length), ...u16(0)]);
      local.push(header, name, bytes);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(bytes.length), ...u32(bytes.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += header.length + name.length + bytes.length;
    }
    const size = central.reduce((sum, part) => sum + part.length, 0);
    return new Blob([...local, ...central, new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)])], { type: "application/zip" });
  }
  const api = { escapeHtml, slugify, localDate, folderName, folderPath, permalink, safeUrl, youtubeUrl, sanitize, textFromHtml, parseArticle, articleSource, createZip };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BlogEditorCore = api;
})(globalThis);
