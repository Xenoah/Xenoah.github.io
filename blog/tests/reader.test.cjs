const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const source = fs.readFileSync(path.join(__dirname, "../assets/reader.js"), "utf8");

test("reader filters combine normalized words and tags, retain URL state and reset", () => {
  const dom = new JSDOM('<form id="articleFilters" hidden><input id="articleSearch"><select id="articleTag"><option value="">All</option></select></form><p id="searchStatus" hidden></p><div id="articleList"><article class="post-card" data-tags=\'["日記"]\' data-search="VRChat 本文">A</article><article class="post-card" data-tags=\'["技術"]\' data-search="Web 本文">B</article></div>', { url: "https://example.test/blog/?tag=" + encodeURIComponent("日記"), runScripts: "outside-only" });
  const w = dom.window; w.eval(source);
  const visible = () => w.document.querySelectorAll(".post-card:not([hidden])").length;
  assert.equal(visible(), 1);
  const search = w.document.getElementById("articleSearch");
  search.value = "ＶＲＣＨＡＴ 本文"; search.dispatchEvent(new w.Event("input"));
  assert.equal(visible(), 1);
  search.value = "Web"; search.dispatchEvent(new w.Event("input"));
  assert.equal(visible(), 0); assert.match(w.location.search, /q=Web/);
  w.document.getElementById("articleFilters").dispatchEvent(new w.Event("reset", { cancelable: true }));
  assert.equal(visible(), 2); assert.equal(w.location.search, "");
  dom.window.close();
});

test("reader builds a TOC with safe text and nonconflicting heading anchors", () => {
  const dom = new JSDOM('<div id="section-1"></div><main class="article-wrap"><div class="article-body"><h2>One &amp; two</h2><h3 id="custom">Details</h3></div></main>', { runScripts: "outside-only" });
  dom.window.eval(source);
  const links = [...dom.window.document.querySelectorAll(".article-toc a")];
  assert.equal(links.length, 2); assert.equal(links[0].textContent, "One & two");
  assert.equal(links[0].getAttribute("href"), "#section-1-heading");
  assert.equal(links[1].getAttribute("href"), "#custom");
  dom.window.close();
});
