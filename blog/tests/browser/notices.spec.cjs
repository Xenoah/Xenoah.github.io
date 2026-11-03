const { test, expect } = require('@playwright/test');
test('home notices scroll upward, stop/read/resume, and retain accessible links', async ({page})=>{
 await page.goto('/');
 const box=page.locator('[data-notices]'), track=box.locator('.notices-track');
 await expect(box).toHaveClass(/notices-running/);
 await page.mouse.move(0,0);
 const first=await track.evaluate(n=>getComputedStyle(n).transform);
 await page.waitForTimeout(300);
 expect(await track.evaluate(n=>getComputedStyle(n).transform)).not.toBe(first);
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
