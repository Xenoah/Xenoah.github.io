const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const source = fs.readFileSync(path.join(root, 'portfolio.htm'), 'utf8');

test('portfolio leads with self-made 3D models and separates AI-assisted projects', () => {
  const dom = new JSDOM(source), d = dom.window.document;
  assert.deepEqual([...d.querySelectorAll('main > section')].map(n => n.id), ['handmade', 'archive', 'journeys', 'ai-works']);
  assert.equal(d.querySelectorAll('#handmade .portfolio-work').length, 3);
  assert.equal(d.querySelectorAll('#ai-works .portfolio-web-list article').length, 3);
  assert.match(d.querySelector('#handmade').textContent, /自分で制作/);
  assert.match(d.querySelector('#ai-works').textContent, /AIを活用して制作/);
  assert.doesNotMatch(d.querySelector('main').textContent, /AI任せにせず|要件定義.*自分で担当|実装の幅|10\+/);
  assert.match(d.querySelector('#journeys').textContent, /東海道を自転車で走破/);
  assert.match(d.querySelector('#journeys').textContent, /日光街道を徒歩で制覇/);
  assert.doesNotMatch(d.querySelector('#journeys').textContent, /\d+\s*(km|日間|時間)/);
  for (const link of d.querySelectorAll('.portfolio-index a')) assert.ok(d.querySelector(link.getAttribute('href')));
  dom.window.close();
});

test('portfolio preserves source links, local images and scoped styling', () => {
  const dom = new JSDOM(source), d = dom.window.document;
  for (const id of ['6738446', '6460364', '6677390']) assert.ok(d.querySelector(`#handmade a[href="https://3droid.booth.pm/items/${id}"]`));
  assert.ok(d.querySelector('#archive a[href="https://xenoah.github.io/archive-3dmodels/"]'));
  assert.ok(d.querySelector('#ai-works a[href="/projects.htm"]'));
  for (const img of d.querySelectorAll('.portfolio-work img, .portfolio-small-grid img')) {
    assert.ok(img.alt.trim());
    assert.ok(Number(img.width) > 0 && Number(img.height) > 0);
    assert.ok(fs.existsSync(path.join(root, img.getAttribute('src'))));
  }
  assert.ok(d.querySelector('link[href="/assets/site.css"]'));
  assert.ok(d.querySelector('link[href="/assets/portfolio.css"]'));
  assert.equal(d.querySelectorAll('style').length, 0);
  dom.window.close();
});
