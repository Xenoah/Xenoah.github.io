const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '../..');
const script = fs.readFileSync(path.join(root, 'assets/env3-latest.js'), 'utf8');
const markup = fs.readFileSync(path.join(root, '_includes/env3_latest.html'), 'utf8');
const NOW = Date.parse('2026-11-07T12:00:00Z');
const good = (overrides = {}) => ({ ok: true, data: { timestamp: new Date(NOW - 60000).toISOString(), temperature_c: 21.64, humidity_pct: 40.79, pressure_hpa: 1008.4, ...overrides } });
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup(initial = good(), html = markup) {
  const dom = new JSDOM(html, { url: 'https://xenoah.github.io/', pretendToBeVisual: true, runScripts: 'outside-only' });
  const { window } = dom;
  const calls = [];
  let response = initial;
  let interval;
  let timeout;
  let now = NOW;
  window.Date.now = () => now;
  window.setInterval = fn => { interval = fn; return 1; };
  window.setTimeout = fn => { timeout = fn; return 2; };
  window.clearTimeout = () => {};
  window.fetch = async (url, options) => {
    calls.push({ url, options });
    if (typeof response === 'function') return response(url, options);
    if (response instanceof Error) throw response;
    return { ok: true, json: async () => response };
  };
  window.eval(script);
  const d = window.document;
  return { dom, d, calls, panel: d.querySelector('[data-env3-latest]'),
    set: value => { response = value; }, tick: () => interval(), timeout: () => timeout(),
    advance: ms => { now += ms; }, click: () => d.querySelector('button').click() };
}

test('unconfigured data is hidden, zero is real, and only the public snapshot is requested', async () => {
  const s = setup({ ok: false, error: 'not configured' });
  await flush();
  assert.equal(s.panel.hidden, true);
  assert.equal(s.panel.dataset.state, 'unconfigured');
  assert.equal(s.calls[0].url, 'https://xenoah-weather-api.xenoah.chatgpt.site/api/latest');
  for (const [key, value] of Object.entries({ cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })) assert.equal(s.calls[0].options[key], value);
  s.set(good({ temperature_c: 0, humidity_pct: 0 })); s.tick(); await flush();
  assert.equal(s.panel.hidden, false);
  assert.equal(s.d.querySelector('[data-env3-value="temperature_c"]').textContent, '0.0');
  assert.equal(s.d.querySelector('[data-env3-value="humidity_pct"]').textContent, '0.0');
  assert.match(s.d.querySelector('time').textContent, /20:59:00/);
  assert.equal(s.panel.dataset.state, 'ready');
  s.dom.window.close();
});

test('no data is truthful and null / strings / out-of-range values never become numbers', async () => {
  const s = setup({ ok: false, error: 'no data' }); await flush();
  assert.equal(s.panel.dataset.state, 'empty');
  assert.equal(s.d.querySelector('[data-env3-recorded]').hidden, true);
  assert.match(s.panel.textContent, /まだ記録がありません/);
  s.set(good({ temperature_c: null, humidity_pct: '41.2', pressure_hpa: 12000 })); s.click(); await flush();
  assert.equal(s.panel.dataset.state, 'partial');
  assert.deepEqual([...s.d.querySelectorAll('[data-env3-value]')].map(n => n.textContent), ['--', '--', '--']);
  s.dom.window.close();
});

test('stale readings stay visibly stale, including when refresh fails', async () => {
  const s = setup(good({ timestamp: new Date(NOW - 31 * 60000).toISOString() })); await flush();
  assert.equal(s.panel.dataset.state, 'stale');
  assert.match(s.panel.textContent, /現在の値とは限りません/);
  s.set(new Error('private diagnostic must not be shown')); s.advance(10 * 60000); s.tick(); await flush();
  assert.equal(s.panel.dataset.state, 'error');
  assert.match(s.panel.textContent, /41分/);
  assert.match(s.panel.textContent, /前回取得した記録/);
  assert.doesNotMatch(s.panel.textContent, /private diagnostic/);
  assert.equal(s.d.querySelector('[data-env3-value="temperature_c"]').textContent, '21.6');
  s.dom.window.close();
});

test('malformed JSON, unauthorized, invalid/future dates and older records do not replace trusted data', async () => {
  const s = setup(); await flush();
  const datetime = s.d.querySelector('time').dateTime;
  for (const payload of [null, { ok: false, error: 'unauthorized' }, good({ timestamp: 'not a date' }), good({ timestamp: '2026-02-30T12:00:00Z' }), good({ timestamp: '2026-11-07T12:00:00' }), good({ timestamp: new Date(NOW + 6 * 60000).toISOString() }), good({ timestamp: new Date(NOW - 120000).toISOString() })]) {
    s.set(payload); s.click(); await flush();
    assert.equal(s.panel.dataset.state, 'error');
    assert.equal(s.d.querySelector('time').dateTime, datetime);
  }
  s.set(async () => ({ ok: true, json: async () => { throw new Error('bad json'); } })); s.click(); await flush();
  assert.equal(s.panel.dataset.state, 'error');
  s.set(good({ temperature_c: 22 })); s.click(); await flush();
  assert.equal(s.panel.dataset.state, 'ready');
  s.dom.window.close();
});

test('initial HTTP failure is blank and never renders upstream error text or HTML', async () => {
  const s = setup(async () => ({ ok: false })); await flush();
  assert.equal(s.panel.dataset.state, 'error');
  assert.deepEqual([...s.d.querySelectorAll('[data-env3-value]')].map(n => n.textContent), ['--', '--', '--']);
  s.set({ ok: false, error: '<script>secret upstream address</script>' }); s.click(); await flush();
  assert.doesNotMatch(s.panel.textContent, /secret upstream|script>/);
  s.dom.window.close();
});

test('double clicks and reinitialization do not overlap, timeout recovers, visibility and history restore refresh', async () => {
  let finish;
  const s = setup((_, options) => new Promise((resolve, reject) => {
    finish = () => resolve({ ok: true, json: async () => good() });
    options.signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  s.click(); s.tick(); s.dom.window.eval(script);
  assert.equal(s.calls.length, 1);
  assert.equal(s.d.querySelector('button').disabled, true);
  s.timeout(); await flush();
  assert.equal(s.panel.dataset.state, 'error');
  assert.equal(s.d.querySelector('button').disabled, false);
  s.set(good()); s.click(); await flush();
  finish(); await flush(); // late resolution of the aborted promise cannot overwrite the newer state
  assert.equal(s.panel.dataset.state, 'ready');
  Object.defineProperty(s.d, 'hidden', { value: true, configurable: true });
  s.tick(); assert.equal(s.calls.length, 2);
  Object.defineProperty(s.d, 'hidden', { value: false, configurable: true });
  s.d.dispatchEvent(new s.dom.window.Event('visibilitychange')); await flush();
  assert.equal(s.calls.length, 3);
  s.dom.window.dispatchEvent(new s.dom.window.PageTransitionEvent('pageshow', { persisted: true })); await flush();
  assert.equal(s.calls.length, 4);
  s.dom.window.close();
});

test('external sources, query tokens and redirects cannot be configured into the browser request', async () => {
  for (const source of ['https://example.com/private-endpoint', '/data/env3-latest.json?token=do-not-send', '/data/env3-latest.json#secret', '/another-file.json']) {
    const s = setup(good(), markup.replace('https://xenoah-weather-api.xenoah.chatgpt.site/api/latest', source)); await flush();
    assert.equal(s.calls.length, 0);
    assert.equal(s.panel.dataset.state, 'error');
    s.dom.window.close();
  }
});

test('turning publication off hides and clears previous values', async () => {
  const s = setup(); await flush();
  s.set({ ok: false, error: 'not configured' }); s.click(); await flush();
  assert.equal(s.panel.hidden, true);
  assert.equal(s.d.querySelector('time').textContent, '');
  assert.deepEqual([...s.d.querySelectorAll('[data-env3-value]')].map(n => n.textContent), ['--', '--', '--']);
  s.dom.window.close();
});

test('shipped source contains no upstream deployment or secret value and keeps demo values out of production JSON', () => {
  assert.doesNotMatch(script + markup, /script\.google(?:usercontent)?\.com|AKfy|READ_TOKEN|GAS_URL/);
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /include env3_latest\.html/);
});
