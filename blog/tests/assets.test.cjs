const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { checkArticleAssets } = require("../../scripts/check_blog_article_assets.js");
test("asset checker decodes Japanese filenames, checks cover/poster and rejects missing files", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "blog-assets-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dir = path.join(root, "blog/articles/test"); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "写真.png"), "image");
  const article = path.join(dir, "index.html");
  fs.writeFileSync(article, '---\nimage: "/blog/articles/test/' + encodeURIComponent("写真.png") + '"\n---\n<img src="写真.png"><video poster="/blog/articles/test/missing.png"></video><img src="https://other.test/external.png">');
  const result = checkArticleAssets(article, root);
  assert.equal(result.refs, 3); assert.deepEqual(result.missing, ["/blog/articles/test/missing.png"]);
});
