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
