const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  await page.goto("/blog/editor.html");
  await expect(page.locator("#editorApp")).toHaveJSProperty("inert", false);
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
