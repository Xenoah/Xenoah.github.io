/* ui/viewport.js — preview pane に共通のズーム・パン操作を提供する。
 *
 * 対象要素（content）に CSS transform で scale + translate を適用するだけ。
 * - ホイール: カーソル位置を中心にズーム
 * - ドラッグ（左ボタン or middle）: パン
 * - ダブルクリック: フィット
 * - キー: + / - / 0
 * - タッチ: 1 本指でパン、2 本指でピンチズーム
 */

const MIN_SCALE = 0.05;
const MAX_SCALE = 64;

/** @param {{ host: HTMLElement, content: HTMLElement }} opts */
export function attachViewport({ host, content }) {
  const state = { scale: 1, x: 0, y: 0 };
  let fitScale = 1;

  const apply = () => {
    content.style.transformOrigin = '0 0';
    content.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
  };

  const fit = () => {
    const child = content.firstElementChild;
    if (!child) return;
    const cw = child instanceof HTMLCanvasElement ? child.width : child.clientWidth || 1;
    const ch = child instanceof HTMLCanvasElement ? child.height : child.clientHeight || 1;
    const hw = host.clientWidth;
    const hh = host.clientHeight;
    if (!hw || !hh || !cw || !ch) return;
    const s = Math.min(hw / cw, hh / ch) * 0.95;
    fitScale = clamp(s, MIN_SCALE, MAX_SCALE);
    state.scale = fitScale;
    state.x = (hw - cw * state.scale) / 2;
    state.y = (hh - ch * state.scale) / 2;
    apply();
  };

  /** zoom around (px, py) — px/py は host のクライアント座標 */
  const zoomAt = (factor, px, py) => {
    const before = state.scale;
    const after = clamp(before * factor, MIN_SCALE, MAX_SCALE);
    if (after === before) return;
    const ratio = after / before;
    state.x = px - (px - state.x) * ratio;
    state.y = py - (py - state.y) * ratio;
    state.scale = after;
    apply();
  };

  // wheel zoom
  host.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        e.preventDefault();
        const rect = host.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = Math.pow(1.0015, -e.deltaY);
        zoomAt(factor, px, py);
      }
    },
    { passive: false },
  );

  // pointer pan (mouse / pen / touch)
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let activePointers = new Map(); // for pinch
  let pinchPrevDist = 0;

  host.addEventListener('pointerdown', (e) => {
    host.setPointerCapture(e.pointerId);
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.size === 1) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      host.style.cursor = 'grabbing';
    } else if (activePointers.size === 2) {
      dragging = false;
      pinchPrevDist = pinchDistance();
    }
  });
  host.addEventListener('pointermove', (e) => {
    if (!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      const dist = pinchDistance();
      if (pinchPrevDist > 0) {
        const center = pinchCenter(host);
        zoomAt(dist / pinchPrevDist, center.x, center.y);
      }
      pinchPrevDist = dist;
      return;
    }

    if (!dragging) return;
    state.x += e.clientX - lastX;
    state.y += e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    apply();
  });
  const endPointer = (e) => {
    activePointers.delete(e.pointerId);
    if (activePointers.size < 2) pinchPrevDist = 0;
    if (activePointers.size === 0) {
      dragging = false;
      host.style.cursor = '';
    }
  };
  host.addEventListener('pointerup', endPointer);
  host.addEventListener('pointercancel', endPointer);
  host.addEventListener('pointerleave', endPointer);

  // double click → fit
  host.addEventListener('dblclick', () => fit());

  // keyboard
  host.tabIndex = host.tabIndex >= 0 ? host.tabIndex : 0;
  host.addEventListener('keydown', (e) => {
    const rect = host.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    if (e.key === '+' || e.key === '=') {
      zoomAt(1.2, cx, cy);
      e.preventDefault();
    } else if (e.key === '-' || e.key === '_') {
      zoomAt(1 / 1.2, cx, cy);
      e.preventDefault();
    } else if (e.key === '0') {
      fit();
      e.preventDefault();
    }
  });

  // ResizeObserver で host サイズが変わったら状態を保ったまま中央寄せをやり直すことも可能だが
  // 自動 fit は内容差し替え時のみに留める。
  const ro = new ResizeObserver(() => {
    /* 内容のサイズに合わせた再 fit は呼び出し側 (refit) で制御 */
  });
  ro.observe(host);

  function pinchDistance() {
    const pts = [...activePointers.values()];
    if (pts.length < 2) return 0;
    const [a, b] = pts;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function pinchCenter(el) {
    const pts = [...activePointers.values()];
    if (pts.length < 2) return { x: 0, y: 0 };
    const [a, b] = pts;
    const rect = el.getBoundingClientRect();
    return { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
  }

  return {
    fit,
    refit: () => requestAnimationFrame(fit),
    zoomAt,
    getState: () => ({ ...state }),
  };
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
