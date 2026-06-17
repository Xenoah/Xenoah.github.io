/* main.js — 起動エントリ。各 UI モジュールを配線し、Worker と Service Worker を初期化。 */

import { store } from './store.js';
import { loadLocale, apply as applyI18n, t } from './i18n/index.js';
import { initDropZone } from './ui/dropZone.js';
import { initPreview, getViewports } from './ui/preview.js';
import { initSplitter } from './ui/splitter.js';
import { initControls } from './ui/controls.js';
import { initToolbar, applyTheme } from './ui/toolbar.js';
import { attachBrush, resetBrush } from './ui/brush.js';
import { describe, optimize, copyToClipboard } from './engine/optimizeSvg.js';
import { exportSvgAs } from './engine/export.js';

const els = {
  toolbar: document.getElementById('toolbar'),
  fileInput: document.getElementById('file-input'),
  localeSelect: document.getElementById('locale-select'),
  formatSelect: document.getElementById('format-select'),
  sizeTemplateSelect: document.getElementById('size-template-select'),
  liveTraceToggle: document.getElementById('live-trace-toggle'),

  preview: document.getElementById('preview'),
  previewDivider: document.querySelector('.preview__divider'),

  sourceHost: document.getElementById('source-viewport'),
  sourceContent: document.getElementById('source-content'),
  dropzone: document.getElementById('dropzone'),
  sourceCanvas: document.getElementById('source-canvas'),
  sourceMeta: document.getElementById('source-meta'),

  resultHost: document.getElementById('result-viewport'),
  resultContent: document.getElementById('result-content'),
  svgHost: document.getElementById('svg-host'),
  resultPlaceholder: document.getElementById('result-placeholder'),
  resultMeta: document.getElementById('result-meta'),

  compare: document.getElementById('compare'),
  compareBefore: document.getElementById('compare-before'),
  compareAfter: document.getElementById('compare-after'),
  compareHandle: document.getElementById('compare-handle'),
  compareBtn: document.getElementById('compare-btn'),

  status: document.getElementById('status'),
  progress: document.getElementById('progress'),

  modeGroup: document.getElementById('mode-group'),
  preprocessGroup: document.getElementById('preprocess-group'),
  traceGroup: document.getElementById('trace-group'),
  presetGroup: document.getElementById('preset-group'),
  paletteGroup: document.getElementById('palette-group'),
  paletteSection: document.getElementById('palette-section'),
};

let traceWorker = null;
let activeJobId = 0;
let liveTimer = 0;

function getWorker() {
  if (!traceWorker) {
    traceWorker = new Worker(new URL('./workers/trace.worker.js', import.meta.url), {
      type: 'module',
    });
    traceWorker.addEventListener('message', onWorkerMessage);
    traceWorker.addEventListener('error', (e) => {
      console.error('[worker] error', e);
      store.update({ ui: { busy: false, statusKey: 'status.error', progress: 0 } });
    });
  }
  return traceWorker;
}

function onWorkerMessage(event) {
  const msg = event.data;
  if (!msg || msg.id !== activeJobId) return;

  switch (msg.type) {
    case 'progress':
      store.update({ ui: { progress: msg.value } });
      break;
    case 'done': {
      let optimized = optimize(msg.svg, { precision: 2 });
      const palette = extractPalette(optimized);
      // 既存のパレット override を反映
      const override = store.state.paletteOverride;
      if (override) {
        for (const [from, to] of Object.entries(override)) {
          if (palette.includes(from)) {
            const re = new RegExp(`fill="${escapeRegex(from)}"`, 'gi');
            optimized = optimized.replace(re, `fill="${to}"`);
          }
        }
      }
      const meta = describe(optimized);
      store.update({
        svg: optimized,
        svgMeta: meta,
        palette,
        ui: { busy: false, progress: 1, statusKey: 'status.done' },
      });
      break;
    }
    case 'error':
      console.error('[worker] error', msg.message);
      store.update({ ui: { busy: false, progress: 0, statusKey: 'status.error' } });
      break;
  }
}

async function convert() {
  const { source, mode, preprocess, trace } = store.state;
  if (!source) return;

  store.update({
    ui: { busy: true, progress: 0, statusKey: 'status.tracing' },
    svg: null,
    svgMeta: null,
  });

  // ソース canvas には preview 側で前処理済みの画像が入っている。
  const ctx = els.sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    store.update({ ui: { busy: false, statusKey: 'status.error' } });
    return;
  }
  const imageData = ctx.getImageData(0, 0, source.width, source.height);

  const id = ++activeJobId;
  getWorker().postMessage(
    {
      id,
      type: 'trace',
      mode,
      imageData,
      params: { preprocess, trace },
    },
    [imageData.data.buffer],
  );
}

/** ライブ再トレース：パラメータ変更後 350ms のアイドルで再変換。 */
function scheduleLiveTrace() {
  const { source, ui } = store.state;
  if (!ui.liveTrace || !source) return;
  if (liveTimer) clearTimeout(liveTimer);
  liveTimer = setTimeout(() => {
    liveTimer = 0;
    if (store.state.ui.liveTrace) convert();
  }, 350);
}

async function downloadCurrent() {
  const { svg, source, ui } = store.state;
  if (!svg || !source) return;
  const baseName = baseFileName(source);
  try {
    const result = await exportSvgAs(svg, {
      format: ui.exportFormat || 'svg',
      width: source.width,
      height: source.height,
      baseName,
      sizeTemplate: ui.sizeTemplate || 'native',
    });
    if (!result) {
      console.warn('[main] export failed; falling back to .svg');
      saveBlob(new Blob([svg], { type: 'image/svg+xml' }), `${baseName}.svg`);
      return;
    }
    saveBlob(result.blob, result.filename);
  } catch (err) {
    console.error('[main] export error', err);
    store.update({ ui: { statusKey: 'status.error' } });
  }
}

async function copySvg() {
  const { svg } = store.state;
  if (!svg) return;
  const ok = await copyToClipboard(svg);
  if (ok) {
    store.update({ ui: { statusKey: 'status.copied' } });
    setTimeout(() => {
      if (store.state.ui.statusKey === 'status.copied') {
        store.update({ ui: { statusKey: 'status.idle' } });
      }
    }, 1800);
  }
}

function baseFileName(source) {
  return (source?.name ?? 'image').replace(/\.[^.]+$/, '') || 'image';
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractPalette(svg) {
  const set = new Map();
  const re = /fill="(#[0-9a-fA-F]{3,8})"/g;
  let m;
  while ((m = re.exec(svg)) !== null) {
    if (m[1].toLowerCase() === '#none') continue;
    set.set(m[1].toLowerCase(), (set.get(m[1].toLowerCase()) ?? 0) + 1);
  }
  return [...set.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
}

function bindViewportButtons() {
  document.querySelectorAll('[data-viewport]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const which = btn.getAttribute('data-viewport');
      const action = btn.getAttribute('data-action');
      const vps = getViewports();
      const vp = which === 'source' ? vps.source : vps.result;
      if (!vp) return;
      const host = which === 'source' ? els.sourceHost : els.resultHost;
      const rect = host.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      if (action === 'fit') vp.fit();
      else if (action === 'zoom-in') vp.zoomAt(1.25, cx, cy);
      else if (action === 'zoom-out') vp.zoomAt(1 / 1.25, cx, cy);
    });
  });
}

function bindStatus() {
  store.subscribe((state) => {
    const { busy, progress, statusKey } = state.ui;
    els.status.textContent = t(statusKey);
    els.status.setAttribute('data-i18n', statusKey);
    els.progress.hidden = !busy && progress === 0;
    els.progress.value = progress;
  });
}

function bindFormatSelector() {
  if (els.formatSelect) {
    els.formatSelect.value = store.state.ui.exportFormat || 'svg';
    els.formatSelect.addEventListener('change', () => {
      store.update({ ui: { exportFormat: els.formatSelect.value } });
    });
  }
  if (els.sizeTemplateSelect) {
    els.sizeTemplateSelect.value = store.state.ui.sizeTemplate || 'native';
    els.sizeTemplateSelect.addEventListener('change', () => {
      store.update({ ui: { sizeTemplate: els.sizeTemplateSelect.value } });
    });
  }
  store.subscribe((state) => {
    const fmt = state.ui.exportFormat || 'svg';
    if (els.formatSelect && els.formatSelect.value !== fmt) els.formatSelect.value = fmt;
    const tpl = state.ui.sizeTemplate || 'native';
    if (els.sizeTemplateSelect && els.sizeTemplateSelect.value !== tpl) els.sizeTemplateSelect.value = tpl;
  });
}

function bindBrushTools() {
  const tools = document.getElementById('brush-tools');
  const sizeInput = document.getElementById('brush-size');
  if (!tools) return;

  tools.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const tool = target.closest('[data-brush-tool]')?.getAttribute('data-brush-tool');
    if (tool) {
      store.update({ ui: { brushTool: tool } });
      return;
    }
    const action = target.closest('[data-action]')?.getAttribute('data-action');
    if (action === 'brush-clear') {
      resetBrush();
    }
  });

  if (sizeInput) {
    sizeInput.value = String(store.state.ui.brushSize ?? 16);
    sizeInput.addEventListener('input', () => {
      store.update({ ui: { brushSize: Number(sizeInput.value) } });
    });
  }

  store.subscribe((state) => {
    const cur = state.ui.brushTool || 'none';
    tools.querySelectorAll('[data-brush-tool]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-brush-tool') === cur));
    });
    if (sizeInput && Number(sizeInput.value) !== state.ui.brushSize) {
      sizeInput.value = String(state.ui.brushSize);
    }
  });
}

function bindLiveTraceToggle() {
  if (!els.liveTraceToggle) return;
  els.liveTraceToggle.checked = !!store.state.ui.liveTrace;
  els.liveTraceToggle.addEventListener('change', () => {
    store.update({ ui: { liveTrace: els.liveTraceToggle.checked } });
    if (els.liveTraceToggle.checked) scheduleLiveTrace();
  });

  // パラメータ・モード・画像の変化でライブ再トレースをスケジュール
  let lastSig = '';
  store.subscribe((state) => {
    const sig = JSON.stringify({
      mode: state.mode,
      preprocess: state.preprocess,
      trace: state.trace,
      hasSource: !!state.source,
      sourceRef: state.source ? state.source.name + state.source.width + state.source.height : '',
    });
    if (sig !== lastSig) {
      lastSig = sig;
      scheduleLiveTrace();
    }
  });
}

async function bootstrap() {
  applyTheme(store.state.ui.theme);

  const startLocale = store.state.ui.locale ?? 'ja';
  await loadLocale(startLocale);
  els.localeSelect.value = startLocale;

  initDropZone({ dropzoneEl: els.dropzone, fileInputEl: els.fileInput });
  initPreview({
    sourceHost: els.sourceHost,
    sourceContent: els.sourceContent,
    canvasEl: els.sourceCanvas,
    dropzoneEl: els.dropzone,
    sourceMetaEl: els.sourceMeta,
    resultHost: els.resultHost,
    resultContent: els.resultContent,
    svgHostEl: els.svgHost,
    placeholderEl: els.resultPlaceholder,
    resultMetaEl: els.resultMeta,
    compareEl: els.compare,
    compareBeforeEl: els.compareBefore,
    compareAfterEl: els.compareAfter,
    compareHandleEl: els.compareHandle,
    compareBtnEl: els.compareBtn,
  });
  initSplitter({ container: els.preview, divider: els.previewDivider });
  bindViewportButtons();
  initControls({
    modeGroup: els.modeGroup,
    preprocessGroup: els.preprocessGroup,
    traceGroup: els.traceGroup,
    presetGroup: els.presetGroup,
    paletteGroup: els.paletteGroup,
    paletteSection: els.paletteSection,
  });
  initToolbar({
    toolbarEl: els.toolbar,
    fileInputEl: els.fileInput,
    localeSelectEl: els.localeSelect,
    onConvert: convert,
    onDownload: downloadCurrent,
    onCopy: copySvg,
    onLocaleChange: async (loc) => {
      store.update({ ui: { locale: loc } });
      await loadLocale(loc);
      applyI18n();
    },
  });
  bindStatus();
  bindFormatSelector();
  bindLiveTraceToggle();
  bindBrushTools();
  bindShortcuts();

  // 画像差し替え時はブラシをリセット
  let lastSrcRef = store.state.source;
  store.subscribe((state) => {
    if (state.source !== lastSrcRef) {
      lastSrcRef = state.source;
      resetBrush();
    }
  });

  attachBrush({
    host: els.sourceHost,
    sourceCanvas: els.sourceCanvas,
    getViewport: () => getViewports().source?.getState() ?? null,
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./sw.js')
      .catch((err) => console.warn('[sw] register failed', err));
  }
}

function bindShortcuts() {
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      if (store.undo()) e.preventDefault();
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      if (store.redo()) e.preventDefault();
    } else if (key === 'enter') {
      e.preventDefault();
      convert();
    } else if (key === 's') {
      e.preventDefault();
      downloadCurrent();
    }
  });
}

bootstrap().catch((err) => {
  console.error('[main] bootstrap failed', err);
});
