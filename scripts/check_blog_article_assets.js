// 記事内の /blog/articles/... 参照がリポジトリ内に存在するか検査する。
const fs = require("fs");
const path = require("path");

function checkArticleAssets(article, root = path.resolve(__dirname, "..")) {
  const source = fs.readFileSync(article, "utf8"), refs = [];
  const pattern = /(?:\b(?:src|poster)\s*=\s*["']([^"']+)["']|url\(["']?([^"')]+)["']?\)|^image:\s*["']?([^"'\r\n]+))/gm;
  for (const match of source.matchAll(pattern)) {
    const ref = (match[1] || match[2] || match[3]).trim();
    if (/^(?:data:|#|\/\/)/i.test(ref)) continue;
    if (/^https?:/i.test(ref) && new URL(ref).origin !== "https://xenoah.github.io") continue;
    refs.push(ref);
  }
  const missing = [...new Set(refs)].filter((ref) => {
    try {
      const relative = decodeURIComponent(ref.replace(/^https:\/\/xenoah\.github\.io/, "").split(/[?#]/)[0]);
      const resolved = path.resolve(relative.startsWith("/") ? root : path.dirname(article), relative.replace(/^\/+/, ""));
      const inside = path.relative(root, resolved);
      return inside.startsWith(".." + path.sep) || path.isAbsolute(inside) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile();
    } catch { return true; }
  });
  return { article: path.relative(root, article), refs: refs.length, unique: new Set(refs).size, missing };
}
if (require.main === module) {
  const root = path.resolve(__dirname, ".."), article = process.argv[2];
  const files = article ? [path.resolve(article)] : fs.readdirSync(path.join(root, "blog/articles"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => path.join(root, "blog/articles", entry.name, "index.html"));
  const results = files.map((file) => checkArticleAssets(file, root));
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => result.missing.length)) process.exitCode = 1;
}
module.exports = { checkArticleAssets };
