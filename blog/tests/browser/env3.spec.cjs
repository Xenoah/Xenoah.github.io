const { test, expect } = require('@playwright/test');
const good = (overrides = {}) => ({ ok: true, data: {
  timestamp: new Date(Date.now() - 60000).toISOString(),
  temperature_c: 21.6, humidity_pct: 41.2, pressure_hpa: 1008.4, ...overrides
} });

test('unconfigured sensor stays hidden', async ({ page }) => {
  await page.route('https://xenoah-weather-api.xenoah.chatgpt.site/api/latest', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: { ok: false, error: 'not configured' } }));
  await page.goto('/');
  await expect(page.locator('[data-env3-latest]')).toHaveAttribute('data-state', 'unconfigured');
  await expect(page.locator('[data-env3-latest]')).toBeHidden();
});

test('latest values, units, recorded time and keyboard refresh fit the page', async ({ page }) => {
  let response = good(); let requests = 0;
  await page.route('https://xenoah-weather-api.xenoah.chatgpt.site/api/latest', route => { requests++; return route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: response }); });
  await page.goto('/');
  const panel = page.locator('[data-env3-latest]');
  await expect(panel).toHaveAttribute('data-state', 'ready');
  await expect(panel.locator('[data-env3-value="temperature_c"]')).toHaveText('21.6');
  await expect(panel.locator('[data-env3-value="humidity_pct"]')).toHaveText('41.2');
  await expect(panel.locator('[data-env3-value="pressure_hpa"]')).toHaveText('1008.4');
  await expect(panel.locator('time')).toHaveAttribute('datetime', response.data.timestamp);
  await expect(panel).toContainText('日本時間');
  response = good({ temperature_c: 0 });
  await panel.getByRole('button', { name: '表示を更新' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('[data-env3-value="temperature_c"]')).toHaveText('0.0');
  expect(requests).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('empty, partial, old and failed data are visibly different and retry recovers', async ({ page }) => {
  let response = { ok: false, error: 'no data' }; let fail = false;
  await page.route('https://xenoah-weather-api.xenoah.chatgpt.site/api/latest', route => fail ? route.fulfill({ headers: { 'access-control-allow-origin': '*' }, status: 503, body: 'unavailable' }) : route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: response }));
  await page.goto('/');
  const panel = page.locator('[data-env3-latest]');
  const button = panel.getByRole('button', { name: '表示を更新' });
  await expect(panel).toHaveAttribute('data-state', 'empty');
  await expect(panel).toContainText('まだ記録がありません');
  response = good({ temperature_c: null }); await button.click();
  await expect(panel).toHaveAttribute('data-state', 'partial');
  await expect(panel.locator('[data-env3-value="temperature_c"]')).toHaveText('--');
  // Reload to model opening a page after the sensor has stopped (older snapshots during a session are rejected).
  response = good({ timestamp: new Date(Date.now() - 31 * 60000).toISOString() }); await page.reload();
  await expect(panel).toHaveAttribute('data-state', 'stale');
  await expect(panel).toContainText('現在の値とは限りません');
  fail = true; await button.click();
  await expect(panel).toHaveAttribute('data-state', 'error');
  await expect(panel).toContainText('前回取得した記録');
  await expect(panel).toContainText('現在の値とは限りません');
  fail = false; response = good({ temperature_c: 23 }); await button.click();
  await expect(panel).toHaveAttribute('data-state', 'ready');
  await expect(panel.locator('[data-env3-value="temperature_c"]')).toHaveText('23.0');
});

test('navigation away and back leaves the sensor and site usable', async ({ page }) => {
  await page.route('https://xenoah-weather-api.xenoah.chatgpt.site/api/latest', route => route.fulfill({ headers: { 'access-control-allow-origin': '*' }, json: good() }));
  await page.goto('/');
  await expect(page.locator('[data-env3-latest]')).toHaveAttribute('data-state', 'ready');
  await page.goto('/projects.htm');
  await page.goBack();
  await expect(page.locator('[data-env3-latest]')).toHaveAttribute('data-state', 'ready');
  await page.locator('[data-env3-refresh]').click();
  await expect(page.locator('[data-env3-refresh]')).toBeEnabled();
});
