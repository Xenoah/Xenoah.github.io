#!/usr/bin/env node
// Read-only reachability check. Do not infer Pages availability from the repo name.
const fs = require("node:fs"), path = require("node:path");
const all = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/projects.json"), "utf8"));
const i = process.argv.indexOf("--id"), selected = i < 0 ? all : all.filter(p => p.id === process.argv[i + 1]);
if (!selected.length) { console.error("Unknown or missing project id"); process.exit(1); }
const urls = [...new Set(selected.flatMap(p => [p.pagesUrl, p.sourceUrl]).filter(Boolean))];
let failures = 0, next = 0;
async function worker() {
  while (next < urls.length) {
    const url = urls[next++];
    try {
      let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(20000) });
      if (response.status === 405) response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) { failures++; console.error(`${response.status} ${url}`); }
      else console.log(`${response.status} ${url}`);
      await response.body?.cancel();
    } catch (error) { failures++; console.error(`UNVERIFIED ${url}: ${error.message}`); }
  }
}
Promise.all(Array.from({ length: Math.min(3, urls.length) }, worker)).then(() => { process.exitCode = failures ? 1 : 0; });
