/* ui/splitter.js — preview の divider をドラッグして左右（横画面時は上下）比率を変える。 */

const STORAGE_KEY = 'xnh-svg-conv:split';
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

/** @param {{ container: HTMLElement, divider: HTMLElement }} opts */
export function initSplitter({ container, divider }) {
  let ratio = loadRatio();
  apply();

  let dragging = false;
  let isVertical = false;

  divider.addEventListener('pointerdown', (e) => {
    dragging = true;
    isVertical = matchMedia('(max-width: 880px)').matches;
    divider.setPointerCapture(e.pointerId);
    document.body.style.userSelect = 'none';
  });
  divider.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = container.getBoundingClientRect();
    const next = isVertical
      ? (e.clientY - rect.top) / rect.height
      : (e.clientX - rect.left) / rect.width;
    ratio = clamp(next, MIN_RATIO, MAX_RATIO);
    apply();
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = '';
    saveRatio(ratio);
    try { divider.releasePointerCapture(e.pointerId); } catch {}
  };
  divider.addEventListener('pointerup', end);
  divider.addEventListener('pointercancel', end);

  divider.addEventListener('dblclick', () => {
    ratio = 0.5;
    apply();
    saveRatio(ratio);
  });

  function apply() {
    if (matchMedia('(max-width: 880px)').matches) {
      container.style.gridTemplateColumns = '';
      container.style.gridTemplateRows = `${ratio}fr 6px ${1 - ratio}fr`;
    } else {
      container.style.gridTemplateRows = '';
      container.style.gridTemplateColumns = `${ratio}fr 6px ${1 - ratio}fr`;
    }
  }

  matchMedia('(max-width: 880px)').addEventListener('change', apply);
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function loadRatio() {
  try {
    const v = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    if (Number.isFinite(v) && v >= MIN_RATIO && v <= MAX_RATIO) return v;
  } catch {}
  return 0.5;
}

function saveRatio(v) {
  try { localStorage.setItem(STORAGE_KEY, String(v)); } catch {}
}
