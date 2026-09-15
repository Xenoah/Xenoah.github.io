const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
test("catalog filtering normalizes Japanese input, combines categories, handles empty results and reset", () => {
  const dom = new JSDOM(`<main>${read("_includes/project_catalog.html")}</main>`, { url: "https://xenoah.github.io/projects.htm?q=%EF%BC%B3%EF%BC%B6%EF%BC%A7", runScripts: "outside-only" });
  const w = dom.window, d = w.document;
  w.eval(read("assets/project-filter.js"));
  const form = d.querySelector("form"), visible = () => [...d.querySelectorAll("[data-project]")].filter(node => !node.hidden);
  assert.equal(visible().length, 1); assert.match(visible()[0].textContent, /SVG/);
  form.elements.category.value = "music"; form.elements.category.dispatchEvent(new w.Event("change"));
  assert.equal(visible().length, 0); assert.match(d.querySelector("[role=status]").textContent, /該当する作品がありません/);
  form.dispatchEvent(new w.Event("reset", { cancelable: true }));
  assert.equal(visible().length, JSON.parse(read("data/projects.json")).length);
  assert.equal(w.location.search, ""); dom.window.close();
});
test("mobile menu collapses, Escape returns focus, desktop resize opens it", () => {
  const dom = new JSDOM(`<details id="site-navigation" open><summary>Menu</summary>${read("_includes/site_menu.html")}</details>`, { url: "https://xenoah.github.io/", runScripts: "outside-only" });
  const w = dom.window, d = w.document;
  let onResize; const media = { matches: true, addEventListener: (_, fn) => { onResize = fn; } };
  w.matchMedia = () => media; w.eval(read("assets/site-navigation.js"));
  const menu = d.querySelector("details"); assert.equal(menu.open, false);
  menu.open = true; menu.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(menu.open, false); assert.equal(d.activeElement.tagName, "SUMMARY");
  media.matches = false; onResize(); assert.equal(menu.open, true); dom.window.close();
});
test("old menu parameter is removed while article search and fragment survive", () => {
  const dom = new JSDOM("<p>Article</p>", { url: "https://xenoah.github.io/blog/?view=menu&q=SVG#section-1", runScripts: "outside-only" });
  dom.window.eval(read("assets/site-navigation.js"));
  assert.equal(dom.window.location.href, "https://xenoah.github.io/blog/?q=SVG#section-1"); dom.window.close();
});
test("skip link focuses content without leaving a focusable ancestor around editor controls", () => {
  const dom = new JSDOM('<a class="skip-link" href="#main-content">Skip</a><div id="main-content"><button id="control">Control</button></div>', { url: "https://xenoah.github.io/blog/editor.html", runScripts: "outside-only" });
  const w = dom.window, d = w.document, content = d.getElementById("main-content");
  w.eval(read("assets/site-navigation.js"));
  assert.equal(content.hasAttribute("tabindex"), false);
  d.querySelector("a").click(); assert.equal(d.activeElement, content);
  d.getElementById("control").focus(); assert.equal(content.hasAttribute("tabindex"), false);
  dom.window.close();
});
