/* Fetch only the sanitized public API. Never put a private source URL or token here. */
(() => {
  'use strict';
  const panel = document.querySelector('[data-env3-latest]');
  if (!panel || panel.dataset.initialized) return;
  panel.dataset.initialized = 'true';

  const REFRESH_MS = 60 * 1000;
  const PUBLIC_API = 'https://xenoah-weather-api.xenoah.chatgpt.site/api/latest';
  const TIMEOUT_MS = 15000;
  const ranges = { temperature_c: [-40, 125], humidity_pct: [0, 100], pressure_hpa: [300, 1100] };
  const staleMinutes = Number(panel.dataset.staleMinutes);
  const staleMs = (Number.isFinite(staleMinutes) && staleMinutes > 0 ? staleMinutes : 30) * 60000;
  const status = panel.querySelector('[data-env3-status]');
  const refreshButton = panel.querySelector('[data-env3-refresh]');
  const recorded = panel.querySelector('[data-env3-recorded]');
  const time = panel.querySelector('[data-env3-time]');
  const dateFormat = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  let lastRecord = null;
  let requestFailed = false;
  let inFlight = false;

  function clearValues() {
    Object.keys(ranges).forEach(key => { panel.querySelector(`[data-env3-value="${key}"]`).textContent = '--'; });
    recorded.hidden = true;
    time.textContent = '';
    time.removeAttribute('datetime');
  }

  function render() {
    if (!lastRecord) return;
    const age = Date.now() - lastRecord.timestamp;
    const stale = age > staleMs;
    const missing = Object.keys(ranges).filter(key => lastRecord[key] === null).length;
    const messages = [];
    if (requestFailed) messages.push('再取得できませんでした。前回取得した記録を表示しています。');
    if (stale) messages.push(`記録から${Math.floor(age / 60000)}分経過しています。現在の値とは限りません。`);
    if (missing === 3) messages.push('センサー値を取得できていません。');
    else if (missing) messages.push('一部のセンサー値を取得できていません（--）。');
    if (!messages.length) messages.push('最新の記録を表示しています。');
    panel.dataset.state = requestFailed ? 'error' : stale ? 'stale' : missing ? 'partial' : 'ready';
    status.textContent = messages.join(' ');
    Object.keys(ranges).forEach(key => {
      panel.querySelector(`[data-env3-value="${key}"]`).textContent = lastRecord[key] === null ? '--' : lastRecord[key].toFixed(1);
    });
    recorded.hidden = false;
    time.dateTime = new Date(lastRecord.timestamp).toISOString();
    time.textContent = dateFormat.format(new Date(lastRecord.timestamp));
  }

  function normalize(data) {
    // ISO 8601 with an explicit offset: ambiguous local times are not accepted.
    if (!data || typeof data.timestamp !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(data.timestamp)) return null;
    const parts = data.timestamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/).slice(1).map(Number);
    const [year, month, day, hour, minute, second] = parts;
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59 || second > 59) return null;
    const timestamp = Date.parse(data.timestamp);
    if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60000) return null;
    const record = { timestamp };
    for (const [key, [min, max]] of Object.entries(ranges)) {
      const value = data[key];
      record[key] = typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
    }
    return record;
  }

  async function refresh() {
    if (inFlight || document.hidden) return;
    inFlight = true;
    refreshButton.disabled = true;
    refreshButton.textContent = '確認中…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const source = new URL(panel.dataset.source, location.href);
      // Never allow accidentally pasting an upstream URL or a token into the page.
      if (source.href !== PUBLIC_API) {
        throw new Error('Invalid public snapshot path');
      }
      const response = await fetch(source.href, {
        signal: controller.signal, cache: 'no-store', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer'
      });
      if (!response.ok) throw new Error('Snapshot unavailable');
      const payload = await response.json();
      if (payload && payload.ok === false && payload.error === 'not configured') {
        lastRecord = null;
        clearValues();
        panel.hidden = true;
        panel.dataset.state = 'unconfigured';
        return;
      }
      panel.hidden = false;
      if (payload && payload.ok === false && payload.error === 'no data') {
        lastRecord = null;
        clearValues();
        panel.dataset.state = 'empty';
        status.textContent = 'まだ記録がありません。センサーからの送信を待っています。';
        return;
      }
      const next = payload && payload.ok === true && normalize(payload.data);
      if (!next || (lastRecord && next.timestamp < lastRecord.timestamp)) throw new Error('Invalid or older snapshot');
      lastRecord = next;
      requestFailed = false;
      render();
    } catch (_) {
      panel.hidden = false;
      requestFailed = true;
      panel.dataset.state = 'error';
      if (lastRecord) render();
      else {
        clearValues();
        status.textContent = '記録を取得できませんでした。しばらくしてから「表示を更新」を押してください。';
      }
    } finally {
      clearTimeout(timeout);
      refreshButton.disabled = false;
      refreshButton.textContent = '表示を更新';
      inFlight = false;
    }
  }

  refreshButton.addEventListener('click', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); refresh(); } });
  window.addEventListener('pageshow', event => { if (event.persisted) { render(); refresh(); } });
  setInterval(() => { if (!document.hidden) { render(); refresh(); } }, REFRESH_MS);
  refresh();
})();
