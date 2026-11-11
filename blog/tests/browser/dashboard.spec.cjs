const { test, expect } = require('./fixtures.cjs');
const api = 'https://xenoah-weather-api.xenoah.chatgpt.site/api/latest';
const reading = () => ({ ok: true, data: {
  timestamp: new Date().toISOString(), temperature_c: 22.1, humidity_pct: 50.2, pressure_hpa: 1013.2
} });

test('home links to the integrated dashboard without requesting sensor data', async ({ page }) => {
  let requests = 0;
  await page.route(api, route => { requests++; return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: reading() }); });
  await page.goto('/');
  await expect(page.locator('[data-env3-latest]')).toHaveCount(0);
  await expect(page.locator('script[src="/assets/env3-latest.js"]')).toHaveCount(0);
  expect(requests).toBe(0);
  await page.locator('.home-actions').getByRole('link', { name: '［ダッシュボード］', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\.htm$/);
  await expect(page.locator('[data-env3-latest]')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('#sitemap')).toBeVisible();
  await expect(page.locator('#main-content h1')).toHaveText('ダッシュボード');
  expect(requests).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('link', { name: 'サイトマップへ移動', exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\.htm#sitemap$/);
  await page.goBack();
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-env3-latest]')).toHaveCount(0);
  await page.goForward();
  await expect(page.locator('[data-env3-latest]')).toHaveAttribute('data-state', 'ready');
});

test('old sitemap URL arrives at the integrated sitemap section', async ({ page }) => {
  await page.route(api, route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: reading() }));
  await page.goto('/sitemap.htm');
  await expect(page).toHaveURL(/\/dashboard\.htm#sitemap$/);
  await expect(page.locator('#sitemap')).toBeInViewport();
  await expect(page.locator('#main-content')).toContainText('すたでぃー');
  await expect(page.locator('#main-content a[href="/projects.htm"]')).toBeVisible();
});

test('sitemap links and sensor explanation remain usable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 720 } });
  const page = await context.newPage();
  await page.goto('/sitemap.htm');
  await expect(page).toHaveURL(/\/dashboard\.htm#sitemap$/);
  await expect(page.locator('noscript')).toContainText('JavaScriptを有効');
  await expect(page.locator('#main-content a[href="/projects.htm"]')).toBeVisible();
  await expect(page.locator('#main-content a[href="/study/intmath/intmath.html"]')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await context.close();
});
