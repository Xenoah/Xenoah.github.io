const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('sensor is loaded only by the dashboard, with a no-JavaScript explanation', () => {
  const home = read('index.html');
  const dashboard = read('dashboard.htm');
  assert.doesNotMatch(home, /env3_latest|env3-latest\.js|data-env3-latest/);
  assert.match(home, /href="\/dashboard\.htm"/);
  assert.equal((dashboard.match(/include env3_latest\.html/g) || []).length, 1);
  assert.equal((dashboard.match(/src="\/assets\/env3-latest\.js"/g) || []).length, 1);
  const dom = new JSDOM(dashboard);
  assert.match(dom.window.document.querySelector('noscript').textContent, /JavaScript/);
  assert.ok(dom.window.document.querySelector('#sitemap'));
  dom.window.close();
});

test('dashboard retains all generated project categories, article list and archive carousel', () => {
  const dashboard = read('dashboard.htm');
  for (const category of ['tools', 'games', 'learn', 'data', 'models', 'community']) {
    assert.match(dashboard, new RegExp(`PROJECT-LIST:${category}:start`));
    assert.match(dashboard, new RegExp(`PROJECT-LIST:${category}:end`));
  }
  assert.match(dashboard, /include blog_articles\.html/);
  assert.match(dashboard, /id="archive-carousel"/);
  assert.match(dashboard, /href="study\/intmath\/lessons\/arithmetic\/"/);
  const menu = new JSDOM(read('_includes/site_menu.html'));
  const links = menu.window.document.querySelector('.menu-main');
  assert.equal(links.querySelectorAll('a[href="/dashboard.htm"]').length, 1);
  assert.equal(links.querySelectorAll('a[href="/sitemap.htm"]').length, 0);
  menu.window.close();
});

test('legacy sitemap has a no-JavaScript redirect and a clickable fallback to the integrated section', () => {
  const dom = new JSDOM(read('sitemap.htm'));
  const d = dom.window.document;
  assert.equal(d.querySelector('meta[http-equiv="refresh"]').content, '0;url=/dashboard.htm#sitemap');
  assert.equal(d.querySelector('a').getAttribute('href'), '/dashboard.htm#sitemap');
  assert.equal(d.querySelector('link[rel="canonical"]').href, 'https://xenoah.github.io/dashboard.htm');
  assert.match(d.querySelector('meta[name="robots"]').content, /noindex/);
  const xml = read('sitemap.xml');
  assert.match(xml, /<loc>https:\/\/xenoah\.github\.io\/dashboard\.htm<\/loc>/);
  assert.doesNotMatch(xml, /<loc>https:\/\/xenoah\.github\.io\/sitemap\.htm<\/loc>/);
  dom.window.close();
});
