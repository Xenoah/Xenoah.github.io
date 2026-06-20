// 記事ソースを front matter と本文に分け、permalink 配下の公開HTMLを生成する。
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const input = process.argv[2];

if (!input) {
  throw new Error("Usage: node scripts/render_static_blog_article.js <article/index.html>");
}

const inputPath = path.resolve(root, input);
const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "");

function parseFrontMatter(source) {
  // editor.js が出力する限定的なfront matter形式を前提とする。
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return { data: {}, body: source };
  }

  const yaml = match[1];
  const data = {};
  const lines = yaml.split(/\r?\n/);
  let currentList = null;

  for (const line of lines) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentList) {
      data[currentList].push(cleanYamlValue(listMatch[1]));
      continue;
    }

    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }

    const key = pair[1];
    const value = pair[2].trim();
    if (value === "") {
      data[key] = [];
      currentList = key;
    } else {
      data[key] = cleanYamlValue(value);
      currentList = null;
    }
  }

  return { data, body: source.slice(match[0].length) };
}

function cleanYamlValue(value) {
  return String(value).replace(/^["']|["']$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function renderArticle(data, htmlBody) {
  const siteTitle = "Xenoahのホームページ";
  const title = data.title || "Blog Article";
  const description = data.description || stripHtml(htmlBody).trim().slice(0, 160);
  const permalink = data.permalink || "/blog/";
  const image = data.image || "/favicon_katakana.png";
  const tags = Array.isArray(data.tags) ? data.tags : [];
  const dateText = data.date ? String(data.date).replaceAll("-", ".") : "";
  const fullUrl = `https://xenoah.github.io${permalink}`;
  const imageUrl = image.startsWith("http") ? image : `https://xenoah.github.io${image}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} | ${escapeHtml(siteTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${escapeHtml(fullUrl)}">
  <meta property="og:site_name" content="${escapeHtml(siteTitle)}">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(fullUrl)}">
  <meta property="og:image" content="${escapeHtml(imageUrl)}">
  <meta property="og:locale" content="ja_JP">
  <meta property="article:published_time" content="${escapeHtml(data.date || "")}">
  ${tags.map((tag) => `<meta property="article:tag" content="${escapeHtml(tag)}">`).join("\n  ")}
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/blog/assets/blog.css">
  <script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: title,
    description,
    datePublished: data.date || "",
    author: { "@type": "Person", name: "Xenoah" },
    publisher: { "@type": "Person", name: "Xenoah" },
    mainEntityOfPage: fullUrl,
    image: imageUrl,
  })}</script>
</head>
<body>
  <header class="blog-header">
    <a class="brand" href="/blog/" aria-label="Blog home">
      <img src="/file_index/xenoah_banner.png" alt="Xenoah">
    </a>
    <nav class="blog-nav" aria-label="Blog navigation">
      <a href="/blog/">Articles</a>
      <a href="/blog/editor.html">Editor</a>
      <a href="/top.htm">Home</a>
    </nav>
  </header>
  <main class="article-wrap">
    <article class="article">
      <header class="article-head">
        ${dateText ? `<p class="article-kicker">${escapeHtml(dateText)}</p>` : ""}
        <h1>${escapeHtml(title)}</h1>
        ${description ? `<p class="article-lead">${escapeHtml(description)}</p>` : ""}
        ${tags.length ? `<div class="tag-row" aria-label="Tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </header>
      ${image ? `<figure class="eyecatch"><img src="${escapeHtml(image)}" alt=""></figure>` : ""}
      <div class="article-body">
${htmlBody}
      </div>
    </article>
    <nav class="post-nav" aria-label="Post navigation">
      <a href="/blog/">All articles</a>
    </nav>
  </main>
</body>
</html>
`;
}

const parsed = parseFrontMatter(raw);
const htmlBody = parsed.body.trim();
const html = renderArticle(parsed.data, htmlBody);

if (parsed.data.permalink && String(parsed.data.permalink).startsWith("/")) {
  // 記事ソースは残し、GitHub Pagesで直接配信する別パスへ生成物を書き出す。
  const permalinkDir = path.join(root, parsed.data.permalink.replace(/^\//, ""));
  fs.mkdirSync(permalinkDir, { recursive: true });
  fs.writeFileSync(path.join(permalinkDir, "index.html"), html, "utf8");
}

console.log(`rendered ${parsed.data.permalink || input}`);
