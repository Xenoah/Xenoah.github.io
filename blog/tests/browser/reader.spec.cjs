const { test, expect } = require("@playwright/test");
test("Jekyll escapes quoted metadata once and keeps JSON-LD valid", async ({ page }) => {
  const title = '引用 "A&B" </script><img src=x onerror=alert(1)>';
  const description = '説明 "quoted" & <special> 日本語';
  for (const layout of ["post", "blog"]) {
    await page.goto("/blog/ci-meta-" + layout + ".html");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title + " | English title | Xenoah");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", description);
    expect(await page.locator('script[type="application/ld+json"]').evaluate((node) => JSON.parse(node.textContent))).toBeTruthy();
    await expect(page.locator("img[onerror]")).toHaveCount(0);
  }
});
test("published catalog agrees with search, article navigation, RSS and sitemap", async ({ page, request }) => {
  const catalog = await (await request.get("/blog/articles.json")).json();
  expect(catalog.length).toBeGreaterThan(0);
  await page.goto("/blog/");
  await expect(page.locator(".post-card")).toHaveCount(catalog.length);
  await page.locator("#articleSearch").fill(catalog[0].title);
  await expect(page.locator(".post-card:visible")).toHaveCount(1);
  await page.locator(".post-card:visible a").click();
  await expect(page.locator(".article-head h1")).toHaveText(catalog[0].title);
  if (catalog.length > 1) await expect(page.locator(".post-nav a[rel=prev]")).toHaveAttribute("href", catalog[1].url);
  const rss = await (await request.get("/blog/feed.xml")).text();
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const article of catalog) {
    expect(article.url).toMatch(/^\/blog\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/);
    expect(decodeURIComponent(rss)).toContain(decodeURIComponent(article.url));
    expect(decodeURIComponent(sitemap)).toContain(decodeURIComponent(article.url));
  }
  const withHeadings = catalog.find((article) => article.url.includes("vrchat"));
  if (withHeadings) {
    await page.goto(withHeadings.url);
    await expect(page.locator(".article-toc")).toBeVisible();
    await expect(page.locator(".article-toc a").first()).toHaveAttribute("href", /^#/);
  }
});

test("menu frame navigation exposes article URLs and survives history, reload and direct links", async ({ page, request }, testInfo) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  const catalog = await (await request.get("/blog/articles.json")).json();
  const right = page.frameLocator('frame[name="right"]'), left = page.frameLocator('frame[name="left"]');
  const currentArticle = catalog[0];
  await page.goto("/");
  await left.locator('a[href="blog/"]').click();
  await expect(page).toHaveURL(/\/blog\/\?view=menu$/);
  await right.locator(".post-card a").first().click();
  await expect(page).toHaveURL(new RegExp(currentArticle.url + "\\?view=menu$"));
  await expect(right.locator(".article-head h1")).toHaveText(currentArticle.title);
  await expect(left.locator('a[href="blog/"]')).toBeVisible();
  await testInfo.attach("Blog with site menu", { body: await page.screenshot(), contentType: "image/png" });
  const sharedUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(sharedUrl);
  await expect(right.locator(".article-head h1")).toHaveText(currentArticle.title);
  await right.locator('.post-nav a[href="/blog/"]').click();
  await expect(page).toHaveURL(/\/blog\/\?view=menu$/);
  await page.goBack();
  await expect(page).toHaveURL(sharedUrl);
  await expect(right.locator(".article-head h1")).toHaveText(currentArticle.title);
  await page.goForward();
  await expect(page).toHaveURL(/\/blog\/\?view=menu$/);
  await expect(right.locator(".post-card")).toHaveCount(catalog.length);
  await right.locator("#articleSearch").fill("日本語");
  await expect.poll(() => new URL(page.url()).searchParams.get("q")).toBe("日本語");
  await page.reload();
  await expect(right.locator("#articleSearch")).toHaveValue("日本語");
  await page.goto(sharedUrl);
  await expect(right.locator(".article-head h1")).toHaveText(currentArticle.title);
  await right.locator("[data-blog-view]").click();
  await expect(page).toHaveURL(new RegExp(currentArticle.url + "$"));
  await expect(page.locator(".article-head h1")).toHaveText(currentArticle.title);
  await expect(page.locator("frame")).toHaveCount(0);
  await page.locator("[data-blog-view]").click();
  await expect(page).toHaveURL(sharedUrl);
  await expect(right.locator(".article-head h1")).toHaveText(currentArticle.title);
  await left.locator('a[href="top.htm"]').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(left.locator('a[href="blog/"]')).toBeVisible();
  await left.locator('a[href="blog/"]').click();
  await expect(right.locator(".post-card")).toHaveCount(catalog.length);
  expect(errors).toEqual([]);
});

test("old Japanese article links redirect to ASCII URLs and frame entry rejects external destinations", async ({ page }) => {
  const old = "/blog/2026/09/05/ネタバレ注意-まどマギ-ワルプルギスの廻天考察/";
  const current = "/blog/2026/09/05/madoka-walpurgisnacht-rising-review/";
  await page.goto(old + "#section-1");
  await expect(page).toHaveURL(new RegExp(current + "#section-1$"));
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://xenoah.github.io" + current);
  await page.goto(old + "?view=menu");
  await expect(page).toHaveURL(new RegExp(current + "\\?view=menu$"));
  await expect(page.frameLocator('frame[name="right"]').locator(".article-head h1")).toContainText("まどマギ");
  await page.goto("/?blog=" + encodeURIComponent("https://example.com/blog/2026/09/05/other/"));
  // top.htm has its own Twitter embeds; inspect only the navigation's right frame.
  await expect.poll(() => page.frame({ name: "right" })?.url()).toBe("http://127.0.0.1:4173/top.htm");
});

test("editor produces ASCII article URLs from Japanese titles inside the menu frame", async ({ page }) => {
  await page.goto("/blog/editor.html?view=menu");
  const editor = page.frameLocator('frame[name="right"]');
  await expect(editor.locator("#editorApp")).toHaveJSProperty("inert", false);
  await editor.locator("#title").fill("日本語の記事タイトル");
  await editor.locator("#body").fill("記事の本文です。");
  await expect(editor.locator("#slug")).toHaveValue(/^article-[a-z0-9]+$/);
  await expect(editor.locator("#permalinkPreview")).toHaveText(/^\/blog\/[\d/]+article-[a-z0-9]+\/$/);
  await editor.locator("#saveDraftBtn").click();
  await expect(editor.locator("#draftSaved")).toContainText("保存済み");
  await page.reload();
  await expect(editor.locator("#title")).toHaveValue("日本語の記事タイトル");
  await expect(editor.locator("#body")).toHaveText("記事の本文です。");
  await expect(page.frameLocator('frame[name="left"]').locator('a[href="blog/"]')).toBeVisible();
});
