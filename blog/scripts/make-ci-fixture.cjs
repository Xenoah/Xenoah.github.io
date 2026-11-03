// CI only: these untracked fixtures are generated before Jekyll builds the test site.
const fs = require("node:fs"), path = require("node:path");
const title = '引用 "A&B" </script><img src=x onerror=alert(1)>';
const description = '説明 "quoted" & <special> 日本語';
for (const layout of ["post", "blog"]) {
  const source = [
    "---", "layout: " + layout, "title: " + JSON.stringify(title),
    'title_en: "English title"', "description: " + JSON.stringify(description),
    "date: 2026-09-05", "sitemap: false", "permalink: /blog/ci-meta-" + layout + ".html",
    "---", "<p>Metadata escaping fixture</p>"
  ].join("\n");
  fs.writeFileSync(path.join(__dirname, "../ci-meta-" + layout + ".html"), source);
}
// Pages-first pending-note fixture: generated only for tests, never published.
fs.writeFileSync(path.join(__dirname, '../ci-pages-first.html'), [
 '---', 'layout: post', 'title: "2026-11-03｜Pages-first検査"',
 'date: 2026-11-03', 'author: "AI助手"', 'has_x_embeds: true',
 'canonical_url: "https://xenoah.github.io/blog/ci-pages-first.html"',
 'sitemap: false', 'permalink: /blog/ci-pages-first.html', '---',
 '<p class="source-note">AI助手による独立した日記です。note版は後日掲載予定です。</p>',
 '<h2>Pages先行の検査</h2><p>PC未接続でも本文と出典を表示します。</p>',
 '<blockquote class="twitter-tweet" data-dnt="true" data-cards="hidden"><a href="https://x.com/shuminchuuu/status/123">Xで出典を読む</a></blockquote>'
].join('\n'));
