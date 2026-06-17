/* ui/preview.js — 原画 Canvas と SVG 結果の表示・ズームパン・Before/After 比較。
 * 前処理（明るさ・コントラスト・ガンマ・ぼかし・2 値化）はこの層でリアルタイム反映する。 */

import { store } from '../store.js';
import { attachViewport } from './viewport.js';
import { preprocessForPreview, otsuThreshold } from '../engine/preprocess.js';
import { getBrushCanvas } from './brush.js';

let sourceVp = null;
let resultVp = null;
let compareActive = false;

/** @param {{ sourceHost: HTMLElement, sourceContent: HTMLElement, canvasEl: HTMLCanvasElement,
 *           dropzoneEl: HTMLElement, sourceMetaEl: HTMLElement,
 *           resultHost: HTMLElement, resultContent: HTMLElement,
 *           svgHostEl: HTMLElement, placeholderEl: HTMLElement, resultMetaEl: HTMLElement,
 *           compareEl: HTMLElement, compareBeforeEl: HTMLElement,
 *           compareAfterEl: HTMLElement, compareHandleEl: HTMLElement,
 *           compareBtnEl: HTMLElement }} opts */
export function initPreview(opts) {
  sourceVp = attachViewport({ host: opts.sourceHost, content: opts.sourceContent });
  resultVp = attachViewport({ host: opts.resultHost, content: opts.resultContent });

  initCompare(opts);

  let lastSourceRef = null;
  let lastSvgRef = null;
  let lastMode = null;
  let lastPreprocess = null;
  let lastBrushDirty = 0;
  let scheduled = false;

  store.subscribe((state) => {
    const sourceChanged = state.source !== lastSourceRef;
    const modeChanged = state.mode !== lastMode;
    const preprocessChanged = state.preprocess !== lastPreprocess;
    const brushChanged = (state.brushDirty | 0) !== lastBrushDirty;

    if (sourceChanged) {
      lastSourceRef = state.source;
      sourceVp.refit();
    }
    if (modeChanged) lastMode = state.mode;
    if (preprocessChanged) lastPreprocess = state.preprocess;
    if (brushChanged) lastBrushDirty = state.brushDirty | 0;

    if (sourceChanged || modeChanged || preprocessChanged || brushChanged) {
      // debounce — preprocess は重いのでフレームに 1 回まで
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          renderSource(store.state, opts);
          if (compareActive) refreshCompare(opts);
        });
      }
    }

    if (state.svg !== lastSvgRef) {
      lastSvgRef = state.svg;
      renderResult(state.svg, state.svgMeta, opts);
      resultVp.refit();
      if (compareActive) refreshCompare(opts);
    }
  });
}

export function getViewports() {
  return { source: sourceVp, result: resultVp };
}

function renderSource(state, { canvasEl, dropzoneEl, sourceMetaEl }) {
  const { source, mode, preprocess } = state;
  if (!source) {
    canvasEl.hidden = true;
    dropzoneEl.hidden = false;
    sourceMetaEl.textContent = '';
    return;
  }
  dropzoneEl.hidden = true;
  canvasEl.hidden = false;
  canvasEl.width = source.width;
  canvasEl.height = source.height;
  canvasEl.style.width = `${source.width}px`;
  canvasEl.style.height = `${source.height}px`;
  const ctx = canvasEl.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  ctx.drawImage(source.imageBitmap, 0, 0);

  // ブラシキャンバスをソースに合成（前処理の前に適用）
  const brush = getBrushCanvas();
  if (brush) ctx.drawImage(brush, 0, 0);

  const hasPreprocess =
    preprocess.brightness !== 0 ||
    preprocess.contrast !== 0 ||
    Math.abs(preprocess.gamma - 1) > 1e-3 ||
    preprocess.blur > 0 ||
    mode === 'binary' ||
    mode === 'silhouette' ||
    mode === 'outline' ||
    mode === 'centerline' ||
    mode === 'edges';

  if (hasPreprocess) {
    const imageData = ctx.getImageData(0, 0, source.width, source.height);
    preprocessForPreview(imageData, { mode, preprocess });
    ctx.putImageData(imageData, 0, 0);
  }

  let metaText = `${source.width}×${source.height}`;
  if (preprocess.autoThreshold && (mode === 'binary' || mode === 'silhouette' || mode === 'outline' || mode === 'centerline')) {
    // しきい値表示用に再計算（preprocessForPreview 後の grayscale 値で）
    const id = ctx.getImageData(0, 0, source.width, source.height);
    const t = otsuThreshold(id);
    metaText += ` · t=${t}`;
  }
  sourceMetaEl.textContent = metaText;
}

function renderResult(svg, meta, { svgHostEl, placeholderEl, resultMetaEl, compareBtnEl }) {
  if (!svg) {
    svgHostEl.hidden = true;
    svgHostEl.innerHTML = '';
    placeholderEl.hidden = false;
    resultMetaEl.textContent = '';
    if (compareBtnEl) compareBtnEl.toggleAttribute('disabled', true);
    return;
  }
  placeholderEl.hidden = true;
  svgHostEl.hidden = false;
  svgHostEl.innerHTML = svg;
  if (meta) {
    const kb = (meta.bytes / 1024).toFixed(1);
    resultMetaEl.textContent = `${kb} KB · ${meta.nodes} nodes`;
  } else {
    resultMetaEl.textContent = '';
  }
  if (compareBtnEl) compareBtnEl.toggleAttribute('disabled', false);
}

/* ---------- Before/After 比較 ---------- */

function initCompare(opts) {
  const { compareBtnEl, compareEl, compareHandleEl } = opts;
  if (!compareBtnEl || !compareEl) return;

  compareBtnEl.addEventListener('click', () => {
    const { svg, source } = store.state;
    if (!svg || !source) return;
    compareActive = !compareActive;
    compareEl.hidden = !compareActive;
    compareBtnEl.setAttribute('aria-pressed', String(compareActive));
    if (compareActive) {
      refreshCompare(opts);
      setSplit(50, opts);
    }
  });

  // ハンドルドラッグで分割位置調整
  let dragging = false;
  const onPointerDown = (e) => {
    dragging = true;
    compareHandleEl.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragging) return;
    const rect = compareEl.getBoundingClientRect();
    const ratio = ((e.clientX - rect.left) / rect.width) * 100;
    setSplit(clamp(ratio, 0, 100), opts);
  };
  const onPointerUp = (e) => {
    dragging = false;
    try { compareHandleEl.releasePointerCapture(e.pointerId); } catch {}
  };
  compareHandleEl.addEventListener('pointerdown', onPointerDown);
  compareHandleEl.addEventListener('pointermove', onPointerMove);
  compareHandleEl.addEventListener('pointerup', onPointerUp);
  compareHandleEl.addEventListener('pointercancel', onPointerUp);

  compareHandleEl.addEventListener('keydown', (e) => {
    const cur = parseFloat(compareEl.style.getPropertyValue('--split') || '50');
    if (e.key === 'ArrowLeft') setSplit(clamp(cur - 2, 0, 100), opts);
    else if (e.key === 'ArrowRight') setSplit(clamp(cur + 2, 0, 100), opts);
  });
}

function refreshCompare({ compareBeforeEl, compareAfterEl }) {
  const { source, svg } = store.state;
  if (!source || !svg) return;

  // Before = 原画 canvas を data URL で複製
  const tmp = document.createElement('canvas');
  tmp.width = source.width;
  tmp.height = source.height;
  const ctx = tmp.getContext('2d');
  if (ctx) ctx.drawImage(source.imageBitmap, 0, 0);
  compareBeforeEl.style.backgroundImage = `url("${tmp.toDataURL('image/png')}")`;
  compareBeforeEl.style.aspectRatio = `${source.width} / ${source.height}`;

  // After = SVG を直接埋め込み
  compareAfterEl.innerHTML = svg;
  compareAfterEl.style.aspectRatio = `${source.width} / ${source.height}`;
}

function setSplit(pct, { compareEl }) {
  compareEl.style.setProperty('--split', `${pct}`);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
