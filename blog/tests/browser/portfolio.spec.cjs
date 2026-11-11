const { test, expect, protectContext } = require('./fixtures.cjs');

test('portfolio sections, expandable models and navigation work repeatedly', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/portfolio.htm');
  await expect(page.locator('#main-content h1')).toHaveText('Xenoahの制作と挑戦');
  await expect(page.locator('#handmade .portfolio-work')).toHaveCount(3);
  const more = page.locator('.portfolio-more');
  await expect(more).toHaveJSProperty('open', false);
  await more.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(more).toHaveJSProperty('open', true);
  await expect(more.getByRole('link', { name: '卓球台', exact: true })).toBeVisible();
  await more.locator('summary').click(); await expect(more).toHaveJSProperty('open', false);
  await more.locator('summary').click(); await expect(more).toHaveJSProperty('open', true);
  await page.locator('.portfolio-index a[href="#journeys"]').click();
  await expect(page).toHaveURL(/\/portfolio\.htm#journeys$/);
  await expect(page.locator('#journeys')).toBeInViewport();
  await expect(page.locator('#journeys')).toContainText('東海道を自転車で走破');
  await expect(page.locator('#journeys')).toContainText('日光街道を徒歩で制覇');
  await page.locator('.portfolio-index a[href="#ai-works"]').click();
  await expect(page).toHaveURL(/#ai-works$/);
  await page.goBack(); await expect(page).toHaveURL(/#journeys$/);
  await page.goForward(); await expect(page).toHaveURL(/#ai-works$/);
  await page.reload(); await expect(page.locator('#ai-works')).toContainText('AIを活用');
  await page.locator('.portfolio-footer a[href="#main-content"]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  expect(errors).toEqual([]);
  await testInfo.attach('Portfolio self-made models', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
});

test('portfolio remains readable and expandable at 320px without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 720 } });
  await protectContext(context);
  const page = await context.newPage();
  await page.goto('/portfolio.htm');
  await expect(page.locator('#handmade')).toContainText('自分で制作');
  await page.locator('.portfolio-more summary').click();
  await expect(page.locator('.portfolio-more')).toHaveJSProperty('open', true);
  await expect(page.locator('#archive a[href="https://xenoah.github.io/archive-3dmodels/"]')).toBeVisible();
  await page.locator('.portfolio-index a[href="#ai-works"]').click();
  await expect(page).toHaveURL(/#ai-works$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  await context.close();
});
