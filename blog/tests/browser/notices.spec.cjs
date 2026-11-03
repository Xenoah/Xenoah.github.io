const { test, expect } = require('@playwright/test');
test('home notices scroll left on a black dot-matrix display, stop/read/resume, and retain accessible links', async ({page})=>{
 await page.goto('/');
 const box=page.locator('[data-notices]'), track=box.locator('.notices-track');
 await expect(box).toHaveClass(/notices-running/);
 await page.mouse.move(0,0);
 expect(await box.locator('.notices-window').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(8, 8, 8)');
 expect(await box.locator('.notices-list li').first().evaluate(n=>getComputedStyle(n).backgroundImage)).toContain('radial-gradient');
 const first=await track.evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41);
 await page.waitForTimeout(300);
 expect(await track.evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m41)).toBeLessThan(first);
 expect(await track.evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).m42)).toBe(0);
 await box.locator('button').click();await expect(box).not.toHaveClass(/notices-running/);
 await expect(box.locator('[data-notices-copy]')).toHaveCount(0);
 await expect(box.locator('a').first()).toBeVisible();
 await box.locator('button').click();await box.locator('a').first().focus();
 expect(await track.evaluate(n=>getComputedStyle(n).animationName)).toBe('none');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('reduced motion gives a static complete notice list',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 await expect(page.locator('[data-notices]')).not.toHaveClass(/notices-running/);
 await expect(page.locator('[data-notices-copy]')).toHaveCount(0);
 await expect(page.locator('[data-notices-toggle]')).toBeHidden();
});

test('shared ticker is unique, page-wide and above header on home, blog and catalog',async({page})=>{
 for(const url of ['/', '/blog/', '/projects.htm','/changelog.htm']) {
  await page.goto(url);
  const box=page.locator('[data-notices]');
  await expect(box).toHaveCount(1);
  await expect(box).toHaveClass(/notices-running/);
  const bounds=await box.locator('.notices-window').boundingBox();
  const header=await page.locator('.site-topbar').boundingBox();
  expect(bounds.y).toBe(0); expect(bounds.x).toBe(0);
  expect(bounds.width).toBe(await page.evaluate(()=>document.documentElement.clientWidth));
  expect(header.y).toBeGreaterThan(bounds.y+bounds.height);
  const speed=await box.evaluate(n=>n.querySelector('.notices-list').getBoundingClientRect().width / parseFloat(n.style.getPropertyValue('--notices-duration')));
  expect(speed).toBeCloseTo(180);
 }
});
