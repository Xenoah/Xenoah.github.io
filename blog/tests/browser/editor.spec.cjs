const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/blog/editor.html");
  await expect(page.locator("#editorApp")).toHaveJSProperty("inert", false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
async function selectText(locator) {
  await locator.evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
}
test("native typing, formatting, context menu, links and undo retain the manuscript", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("#title").fill("ブラウザで書く記事");
  const body = page.locator("#body");
  await body.click(); await page.keyboard.type("First paragraph"); await page.keyboard.press("Enter");
  await page.keyboard.insertText("日本語の本文です。");
  await expect(body).toContainText("日本語の本文です。");
  await selectText(body.locator("p").first());
  await page.locator('[data-command="bold"]').click();
  await expect(body.locator("b,strong").first()).toContainText("First paragraph");
  await body.locator("p").first().click({ button: "right" });
  await expect(page.locator("#editorContextMenu")).toBeVisible();
  await page.locator('[data-context="h2"]').click();
  await expect(body.locator("h2")).toHaveText("First paragraph");
  await page.locator("#undoBtn").click(); await expect(body.locator("h2")).toHaveCount(0);
  await page.locator("#redoBtn").click(); await expect(body.locator("h2")).toHaveCount(1);
  await selectText(body.locator("h2"));
  await page.locator("#linkBtn").click();
  await page.locator("#insertUrl").fill("https://example.com/");
  await page.locator("#insertForm button[type=submit]").click();
  await expect(body.locator('a[href="https://example.com/"]')).toContainText("First paragraph");
  await page.locator("#previewBtn").click(); await expect(page.locator("#preview")).toContainText("日本語の本文です。");
  await page.locator("#previewBtn").click();
  await page.locator("#saveDraftBtn").click(); await expect(page.locator("#draftSaved")).toContainText("保存済み");
  await page.reload(); await expect(page.locator("#editorApp")).toHaveJSProperty("inert", false);
  await expect(body.locator("h2")).toHaveText("First paragraph");
  await expect(body).toContainText("日本語の本文です。");
  expect(errors).toEqual([]);
});

test("photo processing, caption edits and image context actions survive reload", async ({ page }) => {
  await page.locator("#title").fill("写真の記事");
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 3000; canvas.height = 2000;
    const ctx = canvas.getContext("2d"), gradient = ctx.createLinearGradient(0, 0, 3000, 2000);
    gradient.addColorStop(0, "#246ac1"); gradient.addColorStop(1, "#feccb0");
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 3000, 2000);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("#imageFiles").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") });
  await expect(page.locator("#assetList .library-image")).toHaveCount(1);
  await page.locator("#assetList .library-image").click();
  const figure = page.locator("#body figure").first();
  await expect(figure.locator("img")).toBeVisible();
  await figure.locator("figcaption").fill("写真の説明");
  await figure.locator("img").click({ button: "right" });
  await page.locator('[data-context="editImage"]').click();
  await page.locator("#mediaAlt").fill("青からオレンジへのグラデーション");
  await page.locator("#mediaSize").selectOption("medium-media");
  await page.locator("#saveDraftBtn").click(); await expect(page.locator("#draftSaved")).toContainText("保存済み");
  await page.reload(); await expect(page.locator("#editorApp")).toHaveJSProperty("inert", false);
  await expect(figure.locator("figcaption")).toHaveText("写真の説明");
  await expect(figure.locator("img")).toHaveAttribute("alt", "青からオレンジへのグラデーション");
  await expect(figure).toHaveClass("medium-media");
  await expect(figure.locator("img")).toHaveAttribute("width", /\d+/);
  await page.locator("#openExportBtn").click();
  const download = page.waitForEvent("download");
  await page.locator("#exportFolderBtn").click();
  expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});

test("context menu stays inside the viewport and keyboard dismissal restores focus", async ({ page }) => {
  await page.locator("#body").fill("メニューの確認");
  await page.locator("#body").click({ button: "right" });
  const menu = page.locator("#editorContextMenu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox(), viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  await page.keyboard.press("End"); await page.keyboard.press("Escape");
  await expect(menu).toBeHidden(); await expect(page.locator("#body")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

async function enterHtml(page, html) {
  await page.locator("#htmlModeBtn").click(); await page.locator("#htmlSource").fill(html);
  await page.locator("#visualModeBtn").click();
}
async function changeColor(page, id, value) {
  await page.locator("#" + id).evaluate((input, color) => { input.value = color; input.dispatchEvent(new Event("change", { bubbles: true })); }, value);
}
test("light editor toolbar retains character and paragraph formatting in drafts and exports", async ({ page }, testInfo) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.locator("#title").fill("新しいエディターで書く");
  await expect(page.locator(".manuscript #editorToolbar")).toBeVisible();
  await expect(page.locator("#editorToolbar")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.locator("#editorApp")).toHaveCSS("color-scheme", "light");
  await enterHtml(page, "<p>Styled text</p><p>Other paragraph</p>");
  const paragraph = page.locator("#body > p").first();
  await selectText(paragraph);
  await page.locator("#fontFamily").selectOption("Georgia, serif");
  await page.locator("#fontSize").fill("22"); await page.locator("#fontSize").press("Enter");
  await changeColor(page, "fontColor", "#000000");
  await changeColor(page, "highlightColor", "#ffdd88");
  await page.locator('[data-command="justifyCenter"]').click();
  await page.locator("#moreFormattingBtn").click();
  await page.locator("#lineSpacing").selectOption("1.5");
  await page.locator("#indentBtn").click();
  await page.locator("#paragraphBorder").selectOption("bottom");
  await expect(paragraph).toHaveCSS("text-align", "center");
  await expect(paragraph).toHaveCSS("margin-left", "24px");
  await expect(paragraph).toHaveCSS("border-bottom-width", "1px");
  const styled = paragraph.locator("span").last();
  expect(await styled.evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(22 * 4 / 3, 1);
  await expect(styled).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(styled).toHaveCSS("background-color", "rgb(255, 221, 136)");
  await page.locator("#showMarksBtn").click(); await expect(page.locator("#body")).toHaveClass(/show-marks/);
  await page.locator("#previewBtn").click();
  await expect(page.locator("#preview")).toContainText("Styled text");
  await page.locator("#previewBtn").click();
  await page.locator("#saveDraftBtn").click(); await expect(page.locator("#draftSaved")).toContainText("保存済み");
  await page.reload(); await expect(page.locator("#editorApp")).toHaveJSProperty("inert", false);
  expect(await paragraph.locator("span").last().evaluate((node) => parseFloat(getComputedStyle(node).fontSize))).toBeCloseTo(22 * 4 / 3, 1);
  await expect(paragraph).toHaveCSS("border-bottom-width", "1px");
  await page.locator("#htmlModeBtn").click();
  const html = await page.locator("#htmlSource").inputValue();
  expect(html).toContain("22pt"); expect(html).toContain("Georgia"); expect(html).toContain("line-height: 1.5"); expect(html).not.toContain("¶"); expect(html).not.toContain("blogTyping");
  await page.locator("#visualModeBtn").click();
  await page.evaluate(() => scrollTo(0, 0));
  await testInfo.attach("Light editor", { body: await page.screenshot(), contentType: "image/png" });
  await page.locator("#openExportBtn").click();
  await page.locator("#exportDialog details > summary").click();
  const downloadPromise = page.waitForEvent("download"); await page.locator("#downloadBtn").click();
  const download = await downloadPromise, stream = await download.createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString("utf8")).toContain(html);
  expect(errors).toEqual([]);
});

test("caret formatting, format painter and inserted tables work with native editing", async ({ page }) => {
  await enterHtml(page, "<p>Start</p><p>Target</p>");
  const paragraphs = page.locator("#body > p");
  await paragraphs.first().evaluate((node) => {
    node.parentElement.focus(); const range = document.createRange(); range.selectNodeContents(node); range.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(range); document.dispatchEvent(new Event("selectionchange"));
  });
  await page.locator("#fontSize").fill("18"); await page.locator("#fontSize").press("Enter");
  await page.locator('[data-command="removeFormat"]').click();
  await expect(page.locator("#fontSize")).toHaveValue("12");
  await page.locator("#fontSize").fill("24"); await page.locator("#fontSize").press("Enter");
  await changeColor(page, "fontColor", "#c42b37");
  await page.keyboard.type(" Larger");
  await expect(paragraphs.first()).toHaveText("Start Larger");
  const large = paragraphs.first().locator("font,span").last();
  await expect(large).toHaveCSS("font-size", "32px");
  await expect(large).toHaveCSS("color", "rgb(196, 43, 55)");
  await selectText(large);
  await page.locator("#moreFormattingBtn").click();
  await page.locator("#formatPainterBtn").click();
  await expect(page.locator("#moreFormatting")).toBeHidden();
  await expect(page.locator("#formatPainterBtn")).toHaveAttribute("aria-pressed", "true");
  await selectText(paragraphs.nth(1));
  await paragraphs.nth(1).dispatchEvent("pointerup");
  await expect(page.locator("#formatPainterBtn")).toHaveAttribute("aria-pressed", "false");
  await expect(paragraphs.nth(1).locator("span").last()).toHaveCSS("font-size", "32px");
  await paragraphs.nth(1).click(); await page.keyboard.press("End");
  await page.locator("#insertTableBtn").click(); await page.locator("#tableColumns").fill("2"); await page.locator("#tableRows").fill("1");
  await page.locator("#tableForm button[type=submit]").click();
  const table = page.locator("#body table");
  await expect(table.locator("th")).toHaveCount(2); await expect(table.locator("td")).toHaveCount(2);
  await table.locator("td p").first().click(); await page.keyboard.type("Cell one"); await page.keyboard.press("Tab"); await page.keyboard.type("Cell two");
  await expect(table.locator("td").nth(1)).toHaveText("Cell two");
  await page.keyboard.press("Tab"); await page.keyboard.type("New row");
  await expect(table.locator("td")).toHaveCount(4); await expect(table.locator("td").nth(2)).toHaveText("New row");
  await page.locator("#saveDraftBtn").click(); await expect(page.locator("#draftSaved")).toContainText("保存済み");
  await page.reload(); await expect(page.locator("#editorApp")).toHaveJSProperty("inert", false);
  await expect(table.locator("td").nth(2)).toHaveText("New row");
  await expect(page.locator("#body")).not.toContainText("blogTyping");
  await page.locator("#moreFormattingBtn").focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#moreFormatting")).toBeVisible();
  await page.keyboard.press("Escape"); await expect(page.locator("#moreFormatting")).toBeHidden();
  await expect(page.locator("#body")).toBeFocused();
});

test("color picker focus keeps the editing target visible and applies only to that selection", async ({ page }, testInfo) => {
  await enterHtml(page, "<p>Before <strong>selected words</strong> after</p><p>Next paragraph</p>");
  const body = page.locator("#body"), text = body.locator("strong");
  const original = await body.innerHTML();
  await text.scrollIntoViewIfNeeded();
  await selectText(text);
  await page.locator("#fontColor").focus();
  const highlightText = () => page.evaluate(() => [...(CSS.highlights.get("blog-editor-selection") || [])].map((range) => range.toString()).join(""));
  expect(await highlightText()).toBe("selected words");
  await page.evaluate(() => { getSelection().removeAllRanges(); document.dispatchEvent(new Event("selectionchange")); });
  expect(await highlightText()).toBe("selected words");
  expect(await body.innerHTML()).toBe(original);
  await testInfo.attach("Color selection retained", { body: await page.screenshot(), contentType: "image/png" });
  await changeColor(page, "fontColor", "#bb2244");
  await expect(text.locator("span").last()).toHaveCSS("color", "rgb(187, 34, 68)");
  expect(await page.evaluate(() => getSelection().toString())).toBe("selected words");
  await expect(body.locator("p").first()).not.toHaveCSS("color", "rgb(187, 34, 68)");
  expect(await highlightText()).toBe("");
  await page.locator("#highlightColor").focus();
  expect(await highlightText()).toBe("selected words");
  await changeColor(page, "highlightColor", "#fff0a8");
  await expect(text.locator("span").last()).toHaveCSS("background-color", "rgb(255, 240, 168)");
  await page.locator("#fontColor").focus(); await page.keyboard.press("Escape");
  await expect(body).toBeFocused(); expect(await highlightText()).toBe("");
  expect(await page.evaluate(() => getSelection().toString())).toBe("selected words");
  await page.locator("#fontColor").focus(); await page.locator("#title").click();
  expect(await highlightText()).toBe("");
  await page.locator("#htmlModeBtn").click();
  expect(await page.locator("#htmlSource").inputValue()).not.toContain("blog-editor-selection");
  expect(await page.locator("#htmlSource").inputValue()).not.toContain("editor-selection-overlay");
});
