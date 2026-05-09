const fs = require("fs");
const path = require("path");

const root = process.cwd();
const articleSlug = "2026-05-05-vrchat";
const sourcePath = path.join(root, "vrchat.htm");
const outDir = path.join(root, "blog", "articles", articleSlug);

const source = fs.readFileSync(sourcePath, "utf8");
const mainMatch = source.match(/<main class="article">([\s\S]*?)<\/main>/);

if (!mainMatch) {
  throw new Error("main article not found in vrchat.htm");
}

fs.mkdirSync(outDir, { recursive: true });

let body = mainMatch[1];
body = body.replace(/^[\s\S]*?<a class="profile-link"/, '<a class="profile-link"');
body = body.replace(/\s*<p class="back-link">[\s\S]*?<\/p>\s*$/, "\n");

const srcs = new Set();
srcs.add("images_vrchat/rectangle_large_type_2_3d84719b611df8c4aa030251d20f4347.png");
for (const match of body.matchAll(/src="([^"]+)"|url\(['"]?([^'")]+)['"]?\)/g)) {
  const value = match[1] || match[2];
  if (value && (value.startsWith("images_vrchat/") || value.startsWith("images_links/"))) {
    srcs.add(value);
  }
}

const nameMap = new Map();
for (const rel of srcs) {
  const base = path.basename(rel);
  const destName = rel.startsWith("images_links/") ? `profile-${base}` : base;
  nameMap.set(rel, destName);
  fs.copyFileSync(path.join(root, rel), path.join(outDir, destName));
}

for (const [rel, destName] of nameMap.entries()) {
  body = body.split(rel).join(`/blog/articles/${articleSlug}/${destName}`);
}

body = body.replace(/(<img\s+)(?![^>]*\bloading=)/g, '$1loading="lazy" ');
body = body.replace(/(<iframe\s+)(?![^>]*\bloading=)/g, '$1loading="lazy" ');

const frontMatter = `---
layout: post
blog_article: true
title: "VRChatは私をどう変えたか?振り返った"
date: 2026-05-05
description: "VRChatは、私にとって使い手次第の認識拡大ツールである。出会い、創作、学び、居場所、そして危うさまで振り返る。"
permalink: /blog/2026/05/05/vrchat/
image: "/blog/articles/${articleSlug}/rectangle_large_type_2_3d84719b611df8c4aa030251d20f4347.png"
tags:
  - VRChat
  - VR
  - essay
  - metaverse
---

`;

const note = '<p class="source-note">この記事は既存ページ <a href="/vrchat.htm">vrchat.htm</a> をブログ記事として再構成したものです。元ページはそのまま残しています。</p>\n\n';

fs.writeFileSync(path.join(outDir, "index.html"), frontMatter + note + body.trim() + "\n", "utf8");
console.log(`created ${path.join(outDir, "index.html")} with ${nameMap.size} copied assets`);
