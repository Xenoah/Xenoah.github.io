// DOM tests cover application state and output. Native editing/layout require a real browser.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { JSDOM } = require("jsdom");
const { IDBFactory } = require("fake-indexeddb");
const root = path.resolve(__dirname, "..");
const coreSource = fs.readFileSync(path.join(root, "assets/editor-core.js"), "utf8");
const editorSource = fs.readFileSync(path.join(root, "assets/editor.js"), "utf8");
const pageSource = fs.readFileSync(path.join(root, "editor.html"), "utf8").replace(/^---[\s\S]*?---\s*/, "");
const parsingDom = new JSDOM();
global.DOMParser = parsingDom.window.DOMParser;
const C = require("../assets/editor-core.js");
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
async function until(predicate) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await tick(); }
  assert.fail("Timed out waiting for editor state");
}
async function editor(options = {}) {
  const dom = new JSDOM(pageSource, { url: "https://editor.test/blog/editor.html", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window, downloads = [], urls = new Map(), clipboard = [];
  w.Blob = Blob; w.TextEncoder = TextEncoder; w.Uint8Array = Uint8Array;
  w.indexedDB = options.database || new IDBFactory();
  w.fetch = options.fetch || (async () => ({ ok: true, json: async () => [] }));
  w.confirm = () => true;
  w.document.execCommand = () => true; // Native editing is deliberately not simulated/tested here.
  w.document.queryCommandState = () => false;
  w.URL.createObjectURL = (blob) => { const id = "blob:https://editor.test/" + Math.random(); urls.set(id, blob); return id; };
  w.URL.revokeObjectURL = (id) => urls.delete(id);
  w.HTMLAnchorElement.prototype.click = function () { downloads.push({ name: this.download, blob: urls.get(this.href) }); };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  Object.defineProperty(w.navigator, "clipboard", { value: { writeText: async (text) => clipboard.push(text) } });
  if (options.legacy) w.localStorage.setItem("xenoah_blog_editor_draft_html_v1", JSON.stringify(options.legacy));
  if (options.storageFailure) {
    w.indexedDB = { open() { throw new Error("Storage denied"); } };
    w.Storage.prototype.setItem = () => { throw new Error("Quota exceeded"); };
  }
  w.eval(coreSource);
  for (const file of ["editor-storage.js", "editor-images.js"]) w.eval(fs.readFileSync(path.join(root, "assets", file), "utf8"));
  w.eval(editorSource);
  await until(() => w.document.getElementById("editorApp").inert === false);
  const $ = (id) => w.document.getElementById(id);
  const input = (id, value) => { $(id).value = value; $(id).dispatchEvent(new w.Event("input", { bubbles: true })); };
  const click = async (id) => { $(id).click(); await tick(); };
  const fileInput = async (id, files) => {
    Object.defineProperty($(id), "files", { configurable: true, value: files });
    $(id).dispatchEvent(new w.Event("change", { bubbles: true }));
    await tick();
  };
  return { dom, w, $, input, click, downloads, clipboard, fileInput };
}

test("every article source retains text, media, metadata and its own permalink", () => {
  for (const entry of fs.readdirSync(path.join(root, "articles"), { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const folder = entry.name;
    const raw = fs.readFileSync(path.join(root, "articles", folder, "index.html"), "utf8");
    const parsed = C.parseArticle(raw), exported = C.articleSource(parsed), again = C.parseArticle(exported);
    const originalBody = raw.replace(/^---[\s\S]*?---\s*/, "");
    assert.equal(C.textFromHtml(again.body), C.textFromHtml(originalBody));
    for (const key of ["title", "title_en", "description", "description_en", "date", "tags", "image"]) assert.equal(again[key], parsed[key], key);
    const original = new DOMParser().parseFromString(originalBody, "text/html");
    const result = new DOMParser().parseFromString(again.body, "text/html");
    for (const selector of ["img", "iframe", "figure", "figcaption", "h2", "h3", ".small-media", ".medium-media", ".link-card-image"]) {
      assert.equal(result.querySelectorAll(selector).length, original.querySelectorAll(selector).length, selector);
    }
    assert.match(exported, /^---\nlayout: post\nblog_article: true\n/);
    assert.equal(again.permalink, parsed.permalink, folder + ": permalink changed");
    if (folder.includes("vrchat")) assert.match(result.querySelector(".link-card-image").style.backgroundImage, /aba9a7ce/);
  }
});
test("rendered article imports only the article body and reads metadata", () => {
  const source = '<!doctype html><html><head><title>ブログ機能を追加しました | Xenoah</title><link rel="canonical" href="https://xenoah.github.io/blog/2026/05/08/blog-start/"><meta property="article:published_time" content="2026-05-08T00:00:00+09:00"></head><body><header class="blog-header">ナビゲーション</header><article><header class="article-head"><h1>ブログ機能を追加しました</h1></header><div class="article-body"><p>記事の本文です。</p></div></article><nav class="post-nav">戻る</nav></body></html>';
  const article = C.parseArticle(source);
  assert.equal(article.title, "ブログ機能を追加しました");
  assert.equal(article.date, "2026-05-08");
  assert.equal(article.slug, "blog-start");
  assert.doesNotMatch(article.body, /blog-header|post-nav|<meta|<title/);
});
test("quoted YAML, Japanese tags and English metadata survive repeated exports", () => {
  const data = C.parseArticle('---\nlayout: post\ntitle: "引用 \\"hello\\" と \\\\path"\ntitle_en: "Hello"\ndate: 2026-09-05\ndescription: ""\ntags:\n  - "日記"\n  - \'it\'\'s a tag\'\npermalink: /blog/2026/09/05/my-post/\n---\n<p>本文</p>');
  assert.equal(data.title, '引用 "hello" と \\path');
  assert.equal(data.tags, "日記, it's a tag");
  assert.equal(C.parseArticle(C.articleSource(data)).title, data.title);
  assert.equal(C.parseArticle(C.articleSource(data)).description, "");
});
test("import and export strip active HTML and transient editor state", () => {
  const html = '<script>alert(1)</script><img src="jav&#x09;ascript:alert(1)" onerror="alert(2)"><a href="data:text/html,bad" target="_blank">link</a><iframe srcdoc="<script>bad</script>" src="https://example.com/"></iframe><object data="bad"></object><svg onload="bad"></svg><p contenteditable="true" data-selected="true" style="position:fixed;color:red;background-image:url(javascript:alert(1))">safe</p><img src="blob:temporary">';
  const result = C.sanitize(html);
  assert.doesNotMatch(result, /script|onerror|srcdoc|<iframe|<object|<svg|contenteditable|data-selected|position:|blob:/i);
  assert.match(result, /color: red/);
  assert.match(result, /noopener noreferrer/);
  assert.equal(C.safeUrl(" javascript:alert(1)"), "");
  assert.equal(C.safeUrl("java\nscript:alert(1)"), "");
  assert.equal(C.safeUrl("https://example.com"), "https://example.com");
});
test("YouTube URLs support watch, short and embed links without arbitrary iframes", () => {
  for (const url of ["https://youtu.be/_zW-6VN1NFc", "https://www.youtube.com/watch?v=_zW-6VN1NFc", "https://www.youtube.com/shorts/_zW-6VN1NFc", "https://www.youtube.com/embed/_zW-6VN1NFc?rel=0"]) assert.equal(C.youtubeUrl(url), "https://www.youtube.com/embed/_zW-6VN1NFc?rel=0");
  assert.equal(C.youtubeUrl("https://youtube.com.evil.test/watch?v=_zW-6VN1NFc"), "");
});
test("document paste becomes paragraphs without losing text or intentional emphasis", () => {
  const input = '<h1><span id="docs-internal-guid-example" style="font-weight:normal"><p><span style="color:rgb(0,0,0);background-color:transparent">最初</span></p><p>続き<strong>強調</strong><mark>マーカー</mark></p></span></h1>';
  const clean = C.sanitize(input), doc = new DOMParser().parseFromString(clean, "text/html");
  assert.equal(doc.body.querySelectorAll("h1, span").length, 0);
  assert.equal(doc.body.children.length, 2);
  assert.equal(doc.body.textContent, "最初続き強調マーカー");
  assert.equal(doc.querySelector("strong").textContent, "強調");
  assert.equal(doc.querySelector("mark").textContent, "マーカー");
  assert.equal(C.sanitize("<h1>章の見出し</h1>"), "<h2>章の見出し</h2>");
});
test("ZIP opens in Python zipfile with correct UTF-8 names, content and CRC", async () => {
  const bytes = new Uint8Array([0, 255, 128, 42, 7]);
  const zip = await C.createZip([{ path: "2026-09-05-日記/index.html", bytes: new TextEncoder().encode("<p>日本語</p>") }, { path: "2026-09-05-日記/写真.png", bytes: new Blob([bytes]) }]);
  const result = spawnSync("python", ["-c", "import sys,io,zipfile,json; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); print(json.dumps({'names':z.namelist(),'bad':z.testzip(),'body':z.read(z.namelist()[0]).decode(),'image':list(z.read(z.namelist()[1]))}))"], { input: Buffer.from(await zip.arrayBuffer()), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.deepEqual(data.names, ["2026-09-05-日記/index.html", "2026-09-05-日記/写真.png"]);
  assert.equal(data.bad, null);
  assert.equal(data.body, "<p>日本語</p>");
  assert.deepEqual(data.image, [...bytes]);
});
test("visual/source/preview switching retains formatted content and app undo", async (t) => {
  const e = await editor(); t.after(() => e.dom.window.close());
  e.input("title", "書くテスト");
  await e.click("htmlModeBtn");
  e.input("htmlSource", "<h2>見出し</h2><p>本文と<strong>太字</strong></p>");
  await e.click("visualModeBtn");
  assert.equal(e.$("body").querySelector("strong").textContent, "太字");
  await e.click("previewBtn");
  assert.equal(e.$("preview").querySelector("h1").textContent, "書くテスト");
  assert.equal(e.$("visualPanel").hidden, true);
  await e.click("previewBtn");
  await e.click("undoBtn");
  assert.equal(e.$("body").querySelector("h2"), null);
  await e.click("redoBtn");
  assert.equal(e.$("body").querySelector("h2").textContent, "見出し");
});
test("source import -> local images -> renamed article -> export contains no blob URLs", async (t) => {
  const e = await editor(); t.after(() => e.dom.window.close());
  const html = new File(['---\ntitle: "写真の日記"\ndate: 2026-05-08\npermalink: /blog/2026/05/08/photo/\nimage: "/blog/articles/2026-05-08-photo/写真.PNG"\n---\n<figure><img src="/blog/articles/2026-05-08-photo/写真.PNG" alt="風景"><figcaption>夕方</figcaption></figure>'], "index.html", { type: "text/html" });
  const picture = new File([new Uint8Array([1, 2, 3])], "写真.PNG", { type: "image/png" });
  Object.defineProperty(html, "webkitRelativePath", { value: "photo/index.html" });
  Object.defineProperty(picture, "webkitRelativePath", { value: "photo/写真.PNG" });
  await e.fileInput("importFolder", [html, picture]);
  assert.match(e.$("body").querySelector("img").src, /^blob:/);
  assert.match(e.$("coverPreview").src, /^blob:/);
  e.input("date", "2026-09-05"); e.input("slug", "new-photo");
  await e.click("openExportBtn"); await e.click("copyBtn");
  const exported = e.clipboard.at(-1);
  assert.match(exported, /permalink: \/blog\/2026\/09\/05\/new-photo\//);
  assert.match(exported, /\/blog\/articles\/2026-09-05-new-photo\/%E5%86%99%E7%9C%9F.PNG/);
  assert.doesNotMatch(exported, /blob:|contenteditable|data-selected|aria-label/);
  assert.match(exported, /<figcaption>夕方<\/figcaption>/);
  await e.click("exportFolderBtn");
  assert.equal(e.downloads.length, 1, e.$("exportStatus").textContent);
  assert.equal(e.downloads[0].name, "2026-09-05-new-photo.zip");
});
test("IndexedDB restores article and image bytes together after reload", async (t) => {
  const database = new IDBFactory(), e = await editor({ database });
  t.after(() => e.dom.window.close());
  e.input("title", "画像付きの下書き");
  await e.fileInput("coverFile", [new File([new Uint8Array([4, 5, 6])], "draft.png", { type: "image/png" })]);
  await e.click("saveDraftBtn");
  await until(() => /保存済み/.test(e.$("draftSaved").textContent));
  const next = await editor({ database }); t.after(() => next.dom.window.close());
  assert.equal(next.$("title").value, "画像付きの下書き");
  assert.equal(next.$("imageCount").textContent, "1");
  assert.match(next.$("coverPreview").src, /^blob:/);
  assert.equal(next.$("coverPreview").hidden, false);
});
test("legacy drafts restore automatically and storage failures stay visible", async (t) => {
  const e = await editor({ legacy: { title: "以前の下書き", date: "2026-05-08", slug: "old", body: "<h2>以前の本文</h2>" } });
  t.after(() => e.dom.window.close());
  assert.equal(e.$("title").value, "以前の下書き");
  assert.equal(e.$("body").querySelector("h2").textContent, "以前の本文");
  const failed = await editor({ storageFailure: true }); t.after(() => failed.dom.window.close());
  failed.input("title", "保存に失敗するテスト");
  await failed.click("saveDraftBtn");
  await until(() => failed.$("draftSaved").dataset.state === "error");
  assert.match(failed.$("draftSaved").textContent, /保存できません/);
});

test("multiple drafts remain available and concurrent edits fork without overwriting", async (t) => {
  const database = new IDBFactory(), e = await editor({ database });
  t.after(() => e.dom.window.close());
  e.input("title", "First draft"); await e.click("saveDraftBtn");
  const other = await editor({ database }); t.after(() => other.dom.window.close());
  e.input("title", "First draft updated"); await e.click("saveDraftBtn");
  other.input("title", "Concurrent version"); await other.click("saveDraftBtn");
  assert.match(other.$("appStatus").textContent, /別の下書き/);
  await e.click("newArticleBtn"); e.input("title", "Second draft"); await e.click("saveDraftBtn");
  await e.click("openDraftsBtn");
  const entries = [...e.$("draftList").querySelectorAll(".draft-entry > button")];
  assert.equal(entries.length, 3);
  entries.find((button) => button.textContent.includes("First draft updated")).click(); await tick();
  assert.equal(e.$("title").value, "First draft updated");
});

test("published article opens with its original metadata and local image bytes", async (t) => {
  const article = { title: "Published", title_en: "English title", description: "Summary", description_en: "English summary", date: "2026-09-05", url: "/blog/2026/09/05/published/", image: "/blog/articles/2026-09-05-published/photo.png", tags: ["diary"] };
  const e = await editor({ fetch: async (url) => {
    if (String(url).endsWith("articles.json")) return { ok: true, json: async () => [article] };
    if (String(url).endsWith("photo.png")) return { ok: true, headers: new Headers({ "content-type": "image/png" }), blob: async () => new Blob(["image"]) };
    return { ok: true, text: async () => '<link rel="canonical" href="https://editor.test/blog/2026/09/05/published/"><div class="article-body"><p>Original body</p><img src="/blog/articles/2026-09-05-published/photo.png"></div>' };
  } });
  t.after(() => e.dom.window.close());
  await e.click("openImportBtn"); await e.click("loadPublishedBtn");
  e.$("publishedList").querySelector("button").click();
  await until(() => e.$("title").value === "Published");
  assert.equal(e.$("title_en").value, "English title");
  assert.equal(e.$("description_en").value, "English summary");
  assert.equal(e.$("tags").value, "diary");
  assert.match(e.$("body").querySelector("img").src, /^blob:/);
  await e.click("openExportBtn"); await e.click("copyBtn");
  assert.match(e.clipboard.at(-1), /permalink: \/blog\/2026\/09\/05\/published\//);
});

test("draft store retains image bytes across bounded revisions and rejects stale writes", async () => {
  const DraftStore = require("../assets/editor-storage.js"), store = new DraftStore(new IDBFactory());
  const data = { title: "one", body: "<p>one</p>", savedAt: new Date().toISOString(), assets: [{ id: "photo", name: "photo.png", file: new Blob(["image"]) }] };
  let record = await store.save("a", data, 0);
  for (let i = 0; i < 15; i++) record = await store.save("a", { ...data, title: "revision " + i }, record.seq, true);
  assert.equal(record.history.length, 10);
  const restored = await store.read("a", record.history[0].seq);
  assert.equal(await restored.data.assets[0].file.text(), "image");
  await assert.rejects(store.save("a", data, 1), { name: "DraftConflictError" });
  assert.equal((await store.read("a")).data.title, "revision 14");
  (await store.open()).close();
});
test("missing title blocks export and script source cannot execute in preview", async (t) => {
  const e = await editor(); t.after(() => e.dom.window.close());
  await e.click("openExportBtn"); await e.click("exportFolderBtn");
  assert.match(e.$("exportStatus").textContent, /タイトル/);
  assert.equal(e.downloads.length, 0);
  e.$("exportDialog").close();
  await e.click("htmlModeBtn");
  e.input("htmlSource", '<p>安全な本文</p><script>window.hacked=true</script><img src="x" onerror="window.hacked=true">');
  await e.click("previewBtn");
  assert.equal(e.w.hacked, undefined);
  assert.equal(e.$("preview").querySelector("script"), null);
  assert.equal(e.$("preview").querySelector("img").hasAttribute("onerror"), false);
});

test("publishing blocks empty bodies, missing images and another article's URL", async (t) => {
  const e = await editor({ fetch: async () => ({ ok: true, json: async () => [{ title: "Existing", url: "/blog/2026/09/05/taken/" }] }) });
  t.after(() => e.dom.window.close());
  e.input("title", "New"); e.input("date", "2026-09-05"); e.input("slug", "taken");
  await e.click("openExportBtn"); await e.click("exportFolderBtn");
  assert.match(e.$("exportStatus").textContent, /本文/);
  e.$("exportDialog").close(); await e.click("htmlModeBtn");
  e.input("htmlSource", '<p>Text</p><img src="/missing.png">');
  await e.click("openExportBtn"); await e.click("exportFolderBtn");
  assert.match(e.$("exportStatus").textContent, /未追加/);
  e.$("exportDialog").close(); e.input("htmlSource", "<p>Text</p>");
  await e.click("openExportBtn"); await e.click("exportFolderBtn");
  assert.match(e.$("exportStatus").textContent, /別の記事/);
  assert.equal(e.downloads.length, 0);
  assert.ok(C.publicationIssues({ title: "A", date: "2026-02-30", slug: "a", body: "<p>Body</p>" }).some((issue) => issue.field === "date"));
  assert.ok(C.publicationIssues({ title: "A", date: "2026-09-05", slug: "a", body: "<p>Body</p>", description: "検索結果やSNSカードに表示する短い説明文。" }).some((issue) => issue.field === "description"));
});

test("folder export reuses the destination, confirms replacement and writes images before HTML", async (t) => {
  const e = await editor(); t.after(() => e.dom.window.close());
  let picks = 0, exists = false, failImage = false; const writes = [];
  const directory = { async getFileHandle(name, options) {
    if (!options && !exists) throw Object.assign(new Error("Missing"), { name: "NotFoundError" });
    return { async createWritable() { return { async write() { if (failImage && name !== "index.html") throw new Error("Disk full"); writes.push(name); }, async close() { exists = true; } }; } };
  } };
  e.w.showDirectoryPicker = async () => { picks++; return { name: "articles", getDirectoryHandle: async () => directory }; };
  e.input("title", "Folder export"); await e.click("htmlModeBtn"); e.input("htmlSource", "<p>Body</p>");
  await e.fileInput("coverFile", [new File(["photo"], "photo.png", { type: "image/png" })]);
  await e.click("openExportBtn"); await e.click("saveFolderBtn");
  assert.deepEqual(writes, ["photo.png", "index.html"]);
  e.w.confirm = () => false; await e.click("saveFolderBtn");
  assert.equal(writes.length, 2); assert.equal(picks, 1);
  e.w.confirm = () => true; failImage = true; await e.click("saveFolderBtn");
  assert.equal(writes.length, 2);
  assert.match(e.$("exportStatus").textContent, /Disk full/);
});

test("context menu preserves selected text, supports keyboard dismissal and native-menu opt out", async (t) => {
  const e = await editor(); t.after(() => e.dom.window.close());
  await e.click("htmlModeBtn"); e.input("htmlSource", "<p>選択した文章</p>"); await e.click("visualModeBtn");
  const range = e.w.document.createRange(); range.selectNodeContents(e.$("body").querySelector("p"));
  e.w.getSelection().removeAllRanges(); e.w.getSelection().addRange(range);
  const event = new e.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
  e.$("body").dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(e.$("editorContextMenu").hidden, false);
  const copy = e.$("editorContextMenu").querySelector('[data-context="copy"]');
  assert.equal(copy.disabled, false); copy.click(); await tick();
  assert.equal(e.clipboard.at(-1), "選択した文章");
  assert.equal(e.$("editorContextMenu").hidden, true);
  e.$("body").dispatchEvent(new e.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
  e.$("editorContextMenu").dispatchEvent(new e.w.KeyboardEvent("keydown", { key: "End", bubbles: true }));
  assert.equal(e.w.document.activeElement.dataset.context, "image");
  e.$("editorContextMenu").dispatchEvent(new e.w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(e.$("editorContextMenu").hidden, true);
  assert.equal(e.w.getSelection().toString(), "選択した文章");
  const native = new e.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, shiftKey: true });
  e.$("body").dispatchEvent(native); assert.equal(native.defaultPrevented, false);
});

test("image context menu removes the clicked image and undo restores it", async (t) => {
  const e = await editor(); t.after(() => e.dom.window.close());
  await e.click("htmlModeBtn"); e.input("htmlSource", '<figure><img src="/photo.png" alt="写真"><figcaption>説明</figcaption></figure><p>本文</p>'); await e.click("visualModeBtn");
  e.$("body").querySelector("img").dispatchEvent(new e.w.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
  const remove = e.$("editorContextMenu").querySelector('[data-context="removeImage"]');
  assert.equal(remove.hidden, false); remove.click(); await tick();
  assert.equal(e.$("body").querySelector("img"), null);
  await e.click("undoBtn");
  assert.equal(e.$("body").querySelector("img").alt, "写真");
  assert.equal(e.$("body").querySelector("figcaption").textContent, "説明");
});
