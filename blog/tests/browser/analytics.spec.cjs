const { test, expect, analyticsURL } = require("./fixtures.cjs");

test("local homepage, article and editor make no analytics requests", async ({ page, request }) => {
  const requests = [];
  page.on("request", req => { if (analyticsURL.test(req.url())) requests.push(req.url()); });
  const catalog = await (await request.get("/blog/articles.json")).json();
  for (const url of ["/", "/projects.htm", "/blog/", catalog[0].url, "/blog/editor.html"]) {
    await page.goto(url);
    await expect(page.locator('script[src="/assets/analytics.js"]')).toHaveCount(url === "/blog/editor.html" ? 0 : 1);
    expect(await page.evaluate(() => window.dataLayer)).toBeUndefined();
  }
  expect(requests).toEqual([]);
});

test("fixture blocks accidental Google tags, fetch and beacons before transmission", async ({ page }) => {
  await page.goto("/");
  const failed = [];
  page.on("requestfailed", request => { if (analyticsURL.test(request.url())) failed.push(request.url()); });
  await page.evaluate(() => {
    const tag = document.createElement("script");
    tag.src = "https://www.googletagmanager.com/gtag/js?id=TEST-BLOCKED";
    document.head.appendChild(tag);
    fetch("https://region1.google-analytics.com/g/collect", { method: "POST", mode: "no-cors", body: "blocked-test" }).catch(() => {});
    navigator.sendBeacon("https://www.google-analytics.com/g/collect", "blocked-test");
  });
  await expect.poll(() => failed.length).toBe(3);
});

test("production-page simulation initializes once with page path and title, without sending to GA", async ({ page, context, request }) => {
  const catalog = await (await request.get("/blog/articles.json")).json();
  // Serve real Jekyll output on a simulated production origin. GA remains blocked by the fixture.
  await context.route("https://xenoah.github.io/**", async route => {
    const url = new URL(route.request().url());
    const response = await request.get(url.pathname + url.search);
    await route.fulfill({ response });
  });
  for (const url of ["/", "/projects.htm", catalog[0].url, "/blog/editor.html"]) {
    await page.goto("https://xenoah.github.io" + url + "?q=private#secret");
    await page.evaluate(() => {
      window.__XENOAH_DISABLE_ANALYTICS__ = false;
      for (const [key, value] of [["webdriver", false], ["userAgent", "Browser-QA"], ["globalPrivacyControl", false], ["doNotTrack", "0"]]) {
        Object.defineProperty(navigator, key, { value, configurable: true });
      }
      window.doNotTrack = "0";
    });
    await page.addScriptTag({ url: "/assets/analytics.js" });
    await page.addScriptTag({ url: "/assets/analytics.js" });
    const result = await page.evaluate(() => ({
      title: document.title,
      calls: window.dataLayer ? window.dataLayer.map(call => Array.from(call)) : [],
      tags: document.querySelectorAll('script[src*="googletagmanager.com"]').length
    }));
    if (url === "/blog/editor.html") {
      expect(result.calls).toEqual([]); expect(result.tags).toBe(0);
    } else {
      expect(result.calls).toHaveLength(2);
      expect(result.calls[1][0]).toBe("config");
      expect(result.calls[1][1]).toBe("G-NMPQ2W5W56");
      expect(result.calls[1][2].page_path).toBe(url);
      expect(result.calls[1][2].page_location).toBe("https://xenoah.github.io" + url);
      expect(result.calls[1][2].page_title).toBe(result.title);
      expect(result.tags).toBe(1);
    }
  }
});
