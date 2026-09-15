// Source pages only: generated builds, test reports and templates are not public pages.
const fs = require("node:fs");
const path = require("node:path");
const ignored = new Set(["node_modules", "test-results", "playwright-report", "_site", "_layouts", "_includes", "vendor", "coverage"]);
function htmlFiles(root, relative = "") {
  return fs.readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || ignored.has(entry.name)) return [];
    const file = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? htmlFiles(root, file) : /\.html?$/i.test(file) ? [file] : [];
  });
}
module.exports = { htmlFiles };
