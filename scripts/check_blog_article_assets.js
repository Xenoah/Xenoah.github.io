const fs = require("fs");
const path = require("path");

const article = process.argv[2];
if (!article) {
  throw new Error("Usage: node scripts/check_blog_article_assets.js <article-index.html>");
}

const root = process.cwd();
const source = fs.readFileSync(path.join(root, article), "utf8");
const refs = [];
const pattern = /(?:src="|url\(['"]?)(\/blog\/articles\/[^"')]+)/g;
let match;

while ((match = pattern.exec(source))) {
  refs.push(match[1]);
}

const missing = refs.filter((ref) => !fs.existsSync(path.join(root, ref.replace(/^\//, ""))));
console.log(JSON.stringify({
  refs: refs.length,
  unique: new Set(refs).size,
  missing,
}, null, 2));
