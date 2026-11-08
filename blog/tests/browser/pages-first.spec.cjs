const {test,expect}=require('./fixtures.cjs');
test('Pages-first article works while note publication is pending',async({page})=>{
 await page.route('**/platform.twitter.com/**',route=>route.abort());
 await page.goto('/blog/ci-pages-first.html');
 await expect(page.locator('h1')).toContainText('Pages-first検査');
 await expect(page.locator('.source-note')).toContainText('note版は後日掲載予定');
 await expect(page.locator('.source-note a')).toHaveCount(0);
 await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://xenoah.github.io/blog/ci-pages-first.html');
 await expect(page.locator('meta[name="author"]')).toHaveAttribute('content','AI助手');
 await expect(page.locator('blockquote.twitter-tweet a')).toHaveAttribute('href','https://x.com/shuminchuuu/status/123');
 await expect(page.locator('script[src="https://platform.twitter.com/widgets.js"]')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});
