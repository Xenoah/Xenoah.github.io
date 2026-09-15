#!/usr/bin/env node
const fs = require("node:fs"), path = require("node:path"), { spawnSync } = require("node:child_process");
const { createRequire } = require("node:module");
const { JSDOM } = createRequire(path.resolve(__dirname, "../blog/package.json"))("jsdom");
const { htmlFiles } = require("./site-files");
const root = path.resolve(__dirname, "..");
const origin = "https://xenoah.github.io";
const projects = JSON.parse(fs.readFileSync(path.join(root, "data/projects.json"), "utf8"));
const errors = [], ids = new Set(), pageUrls = new Set(), thumbnails = new Set();
const categories = new Set(["music", "images", "tools", "games", "learn", "data", "models", "software", "community"]);
const localSource = "https://github.com/Xenoah/Xenoah.github.io/tree/main/";
for (const p of projects) {
  const label = p.id || "unnamed project";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id) || ids.has(p.id)) errors.push(`${label}: unique ASCII id required`);
  ids.add(p.id);
  for (const key of ["title", "description", "sourceUrl"]) if (typeof p[key] !== "string" || !p[key].trim()) errors.push(`${label}: ${key} required`);
  if (!categories.has(p.category)) errors.push(`${label}: unknown category`);
  if (!/^https:\/\/github\.com\/Xenoah\/[A-Za-z0-9_.-]+(?:\/(?:tree|blob)\/[^\s?#]+)?$/.test(p.sourceUrl)) errors.push(`${label}: valid GitHub source URL required`);
  if (p.pagesUrl === null) {
    if (!p.sourceOnlyReason?.trim()) errors.push(`${label}: explain why no Pages link is available`);
  } else {
    try {
      const u = new URL(p.pagesUrl);
      if (u.origin !== origin || u.search || u.hash || u.username || u.password) throw new Error();
      if (pageUrls.has(u.href)) errors.push(`${label}: duplicate Pages URL`);
      pageUrls.add(u.href);
      if (p.sourceUrl.startsWith(localSource)) {
        const pageFile = path.join(root, decodeURIComponent(u.pathname));
        if (!fs.existsSync(pageFile)) errors.push(`${label}: local Pages file is missing`);
        if (!fs.existsSync(path.join(root, p.sourceUrl.slice(localSource.length)))) errors.push(`${label}: GitHub source directory is missing`);
      }
    } catch { errors.push(`${label}: Pages URL must be a canonical https://xenoah.github.io URL or null`); }
  }
  if (p.updated && (!/^\d{4}-\d{2}-\d{2}$/.test(p.updated) || Number.isNaN(Date.parse(p.updated)) || new Date(p.updated).toISOString().slice(0,10) !== p.updated)) errors.push(`${label}: invalid update date`);
  if (p.featured !== undefined && typeof p.featured !== "boolean") errors.push(`${label}: featured must be boolean`);
  if (p.thumbnailSlug) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.thumbnailSlug) || thumbnails.has(p.thumbnailSlug)) errors.push(`${label}: unique safe thumbnailSlug required`);
    thumbnails.add(p.thumbnailSlug);
  }
}
const separateSites = projects.filter(p => p.pagesUrl && !p.sourceUrl.startsWith(localSource)).map(p => new URL(p.pagesUrl).pathname.split("/")[1]);
const generatedRoutes = new Set();
for (const file of htmlFiles(root)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const permalink = source.match(/^permalink:\s*["']?([^\s"']+)["']?\s*$/m)?.[1];
  if (permalink) generatedRoutes.add(decodeURIComponent(permalink));
}
for (const file of htmlFiles(root)) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  // Jekyll changes .htm output extensions unless the original URL is explicit.
  if (/\.htm$/.test(file) && source.startsWith("---") && !/^permalink:\s*\/[^\s]+\.htm\s*$/m.test(source)) errors.push(`${file}: explicit .htm permalink required`);
  const dom = new JSDOM(source), document = dom.window.document;
  const robots = document.querySelector('meta[name="robots"]')?.content || "";
  if (/^(tools|games|database)\/[^/]+\/[^/]+\.html?$/.test(file) && !/\bnoindex\b/.test(robots)) {
    const canonical = document.querySelector('link[rel="canonical"]')?.href;
    if (!pageUrls.has(canonical)) errors.push(`${file}: register this public project in data/projects.json`);
  }
  if (document.querySelector("frameset,frame")) errors.push(`${file}: use ordinary navigation instead of frames`);
  // Jekyll templates are inspected after rendering by the browser checks.
  for (const node of document.querySelectorAll("img[src],script[src],link[rel=stylesheet][href],a[href]")) {
    const value = node.getAttribute("src") || node.getAttribute("href");
    if (!value || value.includes("{{") || value.includes("{%") || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) continue;
    let url;
    try { url = new URL(value, `${origin}/${file}`); } catch { errors.push(`${file}: invalid URL ${value}`); continue; }
    const route = decodeURIComponent(url.pathname);
    if (separateSites.includes(route.split("/")[1]) || generatedRoutes.has(route)) continue;
    const target = path.join(root, route);
    if (!fs.existsSync(target)) errors.push(`${file}: missing local link or asset ${value}`);
    else if (fs.statSync(target).isDirectory() && !fs.existsSync(path.join(target, "index.html"))) errors.push(`${file}: directory has no index.html: ${value}`);
  }
  dom.window.close();
}
for (const file of ["index.html", "projects.htm", "menu.htm", "sitemap.htm", "portfolio.htm", "links.htm", "environment.htm", "changelog.htm"]) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  if (!/name="viewport"/.test(source) || !/charset="UTF-8"/i.test(source) && !/charset=UTF-8/i.test(source)) errors.push(`${file}: UTF-8 and mobile viewport required`);
  if (/target=["']right["']/.test(source)) errors.push(`${file}: obsolete frame target`);
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
for (const script of ["check_seo_metadata.js", "build-projects.js"]) {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...(script === "build-projects.js" ? ["--check"] : [])], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Site checks passed: ${projects.length} projects, local links/assets, navigation, metadata and generated output.`);
