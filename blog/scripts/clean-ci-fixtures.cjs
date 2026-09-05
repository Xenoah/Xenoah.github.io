const fs = require("node:fs"), path = require("node:path");
const siteBlog = path.resolve(__dirname, "../../_site/blog");
for (const layout of ["post", "blog"]) {
  fs.rmSync(path.join(siteBlog, "ci-meta-" + layout + ".html"), { force: true });
}
