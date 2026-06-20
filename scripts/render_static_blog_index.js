// blog/articles の front matter を読み、配信用の blog/index.html を再生成する。
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const articlesDir = path.join(root, "blog", "articles");

function parseFrontMatter(source) {
  // 外部YAMLパーサーを使わないため、単純なキー値と箇条書きだけを扱う。
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    return {};
  }
  const data = {};
  const lines = match[1].split(/\r?\n/);
  let currentList = null;

  for (const line of lines) {
    const listMatch = line.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentList) {
      data[currentList].push(clean(listMatch[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!pair) continue;
    if (pair[2].trim() === "") {
      data[pair[1]] = [];
      currentList = pair[1];
    } else {
      data[pair[1]] = clean(pair[2]);
      currentList = null;
    }
  }
  return data;
}

function clean(value) {
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

const articles = [];
for (const dirent of fs.readdirSync(articlesDir, { withFileTypes: true })) {
  if (!dirent.isDirectory()) continue;
  const htmlPath = path.join(articlesDir, dirent.name, "index.html");
  if (!fs.existsSync(htmlPath)) continue;
  const data = parseFrontMatter(fs.readFileSync(htmlPath, "utf8").replace(/^\uFEFF/, ""));
  if (data.blog_article !== "true" && data.blog_article !== true) continue;
  articles.push({
    title: data.title || dirent.name,
    date: data.date || "",
    description: data.description || "",
    image: data.image || "",
    tags: Array.isArray(data.tags) ? data.tags : [],
    url: data.permalink || `/blog/articles/${dirent.name}/`,
  });
}

articles.sort((a, b) => String(b.date).localeCompare(String(a.date)));

const cards = articles.map((article) => `
      <article class="post-card">
        <a href="${escapeHtml(article.url)}">
          ${article.image ? `<span class="post-card-image"><img src="${escapeHtml(article.image)}" alt="" loading="lazy"></span>` : '<span class="post-card-image post-card-image-empty" aria-hidden="true"></span>'}
          <span class="post-card-body">
            <time datetime="${escapeHtml(article.date)}">${escapeHtml(String(article.date).replaceAll("-", "."))}</time>
            <h2>${escapeHtml(article.title)}</h2>
            <p>${escapeHtml(article.description)}</p>
            ${article.tags.length ? `<span class="post-tags">${article.tags.map((tag) => `#${escapeHtml(tag)}`).join(" ")}</span>` : ""}
          </span>
        </a>
      </article>`).join("\n");

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ブログ・制作記録 | Blog and Build Notes | Xenoah</title>
  <meta name="description" content="Web開発、VRChat、電子工作、制作過程、学び直しについて記録するXenoahのブログです。 / Xenoah's blog about web development, VRChat, electronics, creative processes and continuous learning.">
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1">
  <meta name="author" content="Xenoah">
  <link rel="canonical" href="https://xenoah.github.io/blog/">
  <meta property="og:site_name" content="Xenoah">
  <meta property="og:type" content="website">
  <meta property="og:title" content="ブログ・制作記録 | Blog and Build Notes | Xenoah">
  <meta property="og:description" content="Web開発、VRChat、電子工作、制作過程、学び直しについて記録するXenoahのブログです。 / Xenoah's blog about web development, VRChat, electronics, creative processes and continuous learning.">
  <meta property="og:url" content="https://xenoah.github.io/blog/">
  <meta property="og:locale" content="ja_JP">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="ブログ・制作記録 | Blog and Build Notes | Xenoah">
  <meta name="twitter:description" content="Web開発、VRChat、電子工作、制作過程、学び直しについて記録するXenoahのブログです。 / Xenoah's blog about web development, VRChat, electronics, creative processes and continuous learning.">
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/blog/assets/blog.css">
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
  <main class="blog-shell">
    <section class="blog-index-head">
      <div>
        <p class="section-label">Xenoah Journal</p>
        <h1>作ったもの、学んだこと、考えたこと。</h1>
        <p>制作、VRChat、電子工作、プログラミング、学び直しの記録。</p>
      </div>
      <aside class="blog-index-meta" aria-label="Blog summary">
        <span>${articles.length}</span>
        <small>Articles</small>
      </aside>
    </section>
    <section class="post-list" aria-label="Articles">
${cards || '      <p class="empty-state">まだ記事がありません。</p>'}
    </section>
  </main>
</body>
</html>
`;

fs.writeFileSync(path.join(root, "blog", "index.html"), html, "utf8");
console.log(`rendered blog/index.html with ${articles.length} articles`);
