// 公開用HTMLに必要なSEOタグが揃っているかを、更新後の一括確認に使う。
const fs = require("fs");
const path = require("path");
const { htmlFiles } = require("./site-files");

const root = process.cwd();
const ignoredFiles = new Set(["google2c949125a44a6dd7.html"]);
const errors = [];
const indexableCanonicals = [];
let checked = 0;

function count(source, pattern) {
  return (source.match(pattern) || []).length;
}

for (const relativePath of htmlFiles(root).filter((file) => !ignoredFiles.has(file))) {
  let source;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(fs.readFileSync(path.join(root, relativePath))); }
  catch { errors.push(`${relativePath}: UTF-8として読み取れない`); continue; }

  // front matterからJekyllが生成するページは、レイアウト側で検査対象タグを管理する。
  if (!/<head\b/i.test(source)) {
    continue;
  }

  checked += 1;
  const head = source.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || source;
  if (!/<meta\b[^>]*charset\s*=\s*["']?utf-8\b/i.test(head)) errors.push(`${relativePath}: UTF-8のcharset宣言が必要`);
  // Private study pages and legacy redirects deliberately opt out of indexing.
  if (/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*\bnoindex\b/i.test(head)) {
    if (!/<title\b[^>]*>[^<]+<\/title>/i.test(head)) errors.push(`${relativePath}: titleが必要`);
    continue;
  }
  const checks = [
    ["html lang", count(source.slice(0, source.indexOf("<head")), /<html\b[^>]*\blang=["']ja["']/gi), 1],
    ["title", count(head, /<title\b[^>]*>[\s\S]*?<\/title>/gi), 1],
    ["description", count(head, /<meta\b[^>]*\bname=["']description["'][^>]*>/gi), 1],
    ["robots", count(head, /<meta\b[^>]*\bname=["']robots["'][^>]*>/gi), 1],
    ["canonical", count(head, /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi), 1],
    ["og:title", count(head, /<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/gi), 1],
    ["og:description", count(head, /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/gi), 1],
    ["og:url", count(head, /<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/gi), 1],
    ["twitter:title", count(head, /<meta\b[^>]*\bname=["']twitter:title["'][^>]*>/gi), 1],
    ["twitter:description", count(head, /<meta\b[^>]*\bname=["']twitter:description["'][^>]*>/gi), 1],
  ];

  for (const [label, actual, expected] of checks) {
    if (actual !== expected) {
      errors.push(`${relativePath}: ${label} が ${actual} 件（期待値 ${expected} 件）`);
    }
  }

  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  if (!title.includes(" | ") || !/[A-Za-z]/.test(title)) {
    errors.push(`${relativePath}: title が日本語・英語の併記形式ではない`);
  }

  const description =
    head.match(/<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["']([^"']*)["'][^>]*>/i)?.[1] ||
    head.match(/<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']description["'][^>]*>/i)?.[1] ||
    "";
  if (!description.includes(" / ") || !/[A-Za-z]/.test(description)) {
    errors.push(`${relativePath}: description が日本語・英語の併記形式ではない`);
  }

  const robots = head.match(/<meta\b[^>]*\bname=["']robots["'][^>]*\bcontent=(["'])(.*?)\1/i)?.[2] || "";
  const canonical = head.match(/<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=(["'])(.*?)\1/i)?.[2] || "";
  if (!/\bnoindex\b/i.test(robots) && canonical) {
    indexableCanonicals.push([relativePath, canonical]);
  }
}

const sitemapPath = path.join(root, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  const sitemapUrls = new Set(
    [...sitemap.matchAll(/<loc>(.*?)<\/loc>/gi)].map((match) =>
      match[1].replaceAll("&amp;", "&"),
    ),
  );

  for (const [relativePath, canonical] of indexableCanonicals) {
    if (!sitemapUrls.has(canonical)) {
      errors.push(`${relativePath}: canonical URLがsitemap.xmlにない`);
    }
  }
}

if (errors.length > 0) {
  console.error(`SEO検査: ${checked}ページ中 ${errors.length} 件の問題`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`SEO検査: ${checked}ページすべて正常`);
}
