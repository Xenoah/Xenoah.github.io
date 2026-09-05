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
