const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
global.DOMParser = new JSDOM().window.DOMParser;
const C = require("../assets/editor-core.js");
const { checkArticleAssets } = require("../../scripts/check_blog_article_assets.js");
const root = path.resolve(__dirname, "../.."), base = path.join(root, "blog/articles");
const urls = new Set(), errors = [];
let count = 0;
for (const entry of fs.readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
  const file = path.join(base, entry.name, "index.html"), source = fs.readFileSync(file, "utf8");
  const data = C.parseArticle(source);
  const issues = C.publicationIssues(data);
  if (!/^layout:\s*post\s*$/m.test(source) || !/^blog_article:\s*true\s*$/m.test(source)) issues.push({ message: "layout: post and blog_article: true are required" });
  if (!data.permalink) issues.push({ message: "permalink is required" });
  if (!/^\/blog\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(data.permalink || "")) issues.push({ message: "Article permalink must use /blog/YYYY/MM/DD/ascii-slug/" });
  if (data.permalink && data.permalink !== C.permalink(data)) issues.push({ message: "Article permalink must agree with its date and slug" });
  const url = decodeURIComponent(data.permalink || C.permalink(data));
  if (urls.has(url)) issues.push({ message: "Duplicate permalink: " + url });
  urls.add(url);
  for (const missing of checkArticleAssets(file, root).missing) issues.push({ message: "Missing asset: " + missing });
  const body = new DOMParser().parseFromString(source.replace(/^---[\s\S]*?---\s*/, ""), "text/html");
  if (body.querySelector("h1")) issues.push({ message: "Body must use h2/h3; the layout provides h1" });
  for (const issue of issues) errors.push(entry.name + ": " + issue.message);
  count++;
}
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log("Validated " + count + " articles: metadata, permalinks, body and local media.");
