#!/usr/bin/env node
// Instrument only the rendered publication output. Source pages stay untouched.
const fs = require("node:fs"), path = require("node:path");
const { createRequire } = require("node:module");
const { JSDOM } = createRequire(path.resolve(__dirname, "../blog/package.json"))("jsdom");
const { htmlFiles } = require("./site-files");
const loader = '<script src="/assets/analytics.js" defer></script>';

function instrument(html) {
  const end = html.search(/<\/head\s*>/i);
  if (end < 0 || !/<head[\s>]/i.test(html.slice(0, end))) return html;
  // Parse only the head: some full-screen works contain multi-megabyte inline audio.
  const dom = new JSDOM(html.slice(0, end) + "</head>");
  const document = dom.window.document;
  const excluded = /\bnoindex\b/i.test(document.querySelector('meta[name="robots"]')?.content || "") ||
    document.querySelector('meta[http-equiv="refresh" i]');
  const tags = document.querySelectorAll('script[src="/assets/analytics.js"]');
  const valid = excluded ? tags.length === 0 : tags.length === 1 && tags[0].hasAttribute("defer");
  dom.window.close();
  if (valid) return html;
  if (tags.length) throw new Error("Unexpected analytics loader: remove source tags and rebuild");
  return html.slice(0, end) + loader + "\n" + html.slice(end);
}

if (require.main === module) {
  const output = path.resolve(process.argv[2] || "_site");
  const check = process.argv.includes("--check");
  if (output === path.resolve(__dirname, "..") || !fs.existsSync(path.join(output, "assets/analytics.js"))) {
    throw new Error("Pass a Jekyll build directory containing assets/analytics.js, not the source directory");
  }
  let count = 0;
  for (const file of htmlFiles(output)) {
    const target = path.join(output, file), html = fs.readFileSync(target, "utf8");
    let result;
    try { result = instrument(html); } catch (error) { throw new Error(`${file}: ${error.message}`); }
    if (result !== html) {
      if (check) throw new Error(`${file}: missing guarded analytics loader`);
      fs.writeFileSync(target, result);
      count++;
    }
  }
  console.log(check ? "Rendered analytics coverage verified." : `Added guarded analytics to ${count} public pages.`);
}
module.exports = { instrument };
