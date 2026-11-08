const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const { JSDOM } = require("jsdom");
const root = path.resolve(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "assets/analytics.js"), "utf8");
const id = "G-NMPQ2W5W56";
function setup(url = "https://xenoah.github.io/", head = "") {
  // Outside-only scripts cannot make any real analytics network requests.
  return new JSDOM(`<head><title>公開記事 | Xenoah</title>${head}</head>`, {
    url, referrer: "https://example.com/from?q=private#secret", runScripts: "outside-only"
  });
}
function assertDisabled(dom) {
  dom.window.eval(source);
  assert.equal(dom.window.dataLayer, undefined);
  assert.equal(dom.window.document.querySelectorAll('script[src*="googletagmanager"]').length, 0);
  dom.window.close();
}
for (const url of ["http://localhost:4173/", "http://127.0.0.1:4173/", "file:///tmp/index.html", "https://preview.example/", "http://xenoah.github.io/", "https://xenoah.github.io:444/", "https://xenoah.github.io.example.com/", "https://xenoah.github.io/?analytics=off"]) {
  test(`no Google tag for ${url}`, () => assertDisabled(setup(url)));
}
for (const [object, property, value] of [
  ["navigator", "webdriver", true], ["navigator", "userAgent", "HeadlessChrome/150"],
  ["navigator", "globalPrivacyControl", true], ["navigator", "doNotTrack", "1"],
  ["window", "doNotTrack", "1"], ["window", "__XENOAH_DISABLE_ANALYTICS__", true],
  ["window", "ga-disable-" + id, true]
]) {
  test(`respects ${property}`, () => {
    const dom = setup();
    Object.defineProperty(object === "window" ? dom.window : dom.window.navigator, property, { value, configurable: true });
    assertDisabled(dom);
  });
}
for (const head of ['<meta name="robots" content="noindex,follow">', '<meta http-equiv="refresh" content="0;url=/">']) {
  test(`private/editor/redirect page is not tracked: ${head}`, () => assertDisabled(setup("https://xenoah.github.io/blog/editor.html", head)));
}
for (const pathname of ["/", "/index.html", "/projects.htm", "/blog/2026/11/07/diary/", "/study/intmath/lessons/calculus/index.html"]) {
  test(`one config and clean page URL for ${pathname}`, () => {
    const dom = setup("https://xenoah.github.io" + pathname + "?q=private#secret", '<link rel="canonical" href="https://note.com/other">');
    dom.window.eval(source); dom.window.eval(source);
    const calls = Array.from(dom.window.dataLayer, item => Array.from(item));
    assert.equal(calls.length, 2);
    assert.equal(calls[0][0], "js");
    const [command, measurementId, config] = calls[1];
    assert.equal(command, "config"); assert.equal(measurementId, id);
    const pagePath = pathname.replace(/\/index\.html$/, "/");
    assert.equal(config.page_location, "https://xenoah.github.io" + pagePath);
    assert.equal(config.page_path, pagePath);
    assert.equal(config.page_title, "公開記事 | Xenoah");
    assert.equal(config.page_referrer, "https://example.com/from");
    assert.equal(config.allow_google_signals, false);
    assert.equal(config.allow_ad_personalization_signals, false);
    assert.equal(dom.window.document.querySelectorAll('script[src*="googletagmanager"]').length, 1);
    dom.window.close();
  });
}
test("all browser specs use the network-blocking fixture", () => {
  for (const file of fs.readdirSync(path.join(__dirname, "browser")).filter(file => file.endsWith(".spec.cjs"))) {
    const code = fs.readFileSync(path.join(__dirname, "browser", file), "utf8");
    assert.doesNotMatch(code, /require\(["']@playwright\/test["']\)/, file);
    assert.match(code, /require\(["']\.\/fixtures\.cjs["']\)/, file);
  }
});

test("build injection covers public static/blog pages once and excludes private/redirect/verification pages", () => {
  const { instrument } = require("../../scripts/inject-analytics.js");
  const loader = '<script src="/assets/analytics.js" defer></script>';
  const page = '<!doctype html><html><head><title>Public</title></head><body>Article</body></html>';
  const rendered = instrument(page);
  assert.equal(rendered, page.replace('</head>', loader + '\n</head>'));
  assert.equal(instrument(rendered), rendered);
  for (const html of [
    page.replace('</head>', '<meta name="robots" content="noindex,follow"></head>'),
    page.replace('</head>', '<meta http-equiv="refresh" content="0;url=/"></head>'),
    'google-site-verification: abc.html'
  ]) assert.equal(instrument(html), html);
  assert.throws(() => instrument(rendered.replace(loader, loader + loader)), /Unexpected analytics loader/);
  assert.throws(() => instrument(rendered.replace('</head>', '<meta name="robots" content="noindex"></head>')), /Unexpected analytics loader/);
});
