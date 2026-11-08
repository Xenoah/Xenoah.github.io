const { test: base, expect } = require("@playwright/test");

// Defense in depth: even a mistakenly added inline GA tag cannot report test visits.
const analyticsURL = /^https?:\/\/(?:[^/]+\.)?(?:google-analytics\.com|googletagmanager\.com|analytics\.google\.com|doubleclick\.net)(?::\d+)?\//i;
async function protectContext(context) {
  await context.route(analyticsURL, route => route.abort("blockedbyclient"));
  await context.addInitScript(() => { window.__XENOAH_DISABLE_ANALYTICS__ = true; });
}
const test = base.extend({
  _blockAnalytics: [async ({ context }, use) => {
    await protectContext(context);
    await use();
  }, { auto: true }]
});

module.exports = { test, expect, protectContext, analyticsURL };
