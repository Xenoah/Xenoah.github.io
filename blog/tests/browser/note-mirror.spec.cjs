const { test, expect } = require('@playwright/test');
test('note mirrors keep attribution, lightweight covers and source-only embeds', async ({ page, request }) => {
  const response = await request.get('/blog/note-mirror.json');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.account).toBe('xenoah_memo');
  expect(manifest.articles.length).toBeGreaterThan(0);
  await page.route(/https:\/\/(?:platform\.twitter\.com|syndication\.twitter\.com|.*\.twimg\.com)\//, route => route.abort());
  for (const article of manifest.articles) {
    await page.goto(article.permalink);
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', article.url);
    await expect(page.locator('meta[name="author"]')).toHaveAttribute('content', 'AI助手');
    await expect(page.locator('.source-note a')).toHaveAttribute('href', article.url);
    await expect(page.locator('.article-body blockquote.twitter-tweet')).toHaveCount(article.embeds);
    for (const block of await page.locator('.article-body blockquote.twitter-tweet').all()) {
      await expect(block).toHaveText('Xで出典を読む');
      await expect(block.locator('a')).toHaveAttribute('href', /^https:\/\/x\.com\/shuminchuuu\/status\/\d+$/);
      await expect(block.locator('img')).toHaveCount(0);
    }
    const cover=page.locator('.eyecatch img');
    if (await cover.count()) {
      await expect(cover).toHaveJSProperty('complete', true);
      expect(await cover.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
      expect(await cover.evaluate(img=>img.naturalWidth)).toBeLessThanOrEqual(1280);
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  }
  await page.goto('/blog/');
  for (const article of manifest.articles) await expect(page.locator(`a[href="${article.permalink}"]`).first()).toBeVisible();
});
