/* ui/brush.js — ソース canvas に重ねた "ブラシキャンバス" の管理。
 *
 * paint ツール = 黒で描く（前景を加筆）
 * erase ツール = 白で描く（背景化／消しゴム）
 *
 * ブラシキャンバスは単独で持ち、preview.js の renderSource で
 * 「ソース画像 → 前処理 → ブラシ合成」の順に適用する。 */

import { store } from '../store.js';

let brushCanvas = null;
let drawing = false;
let lastX = 0;
let lastY = 0;

/** ソース画像と同じ寸法のブラシキャンバスを取得（必要なら再生成）。 */
export function getBrushCanvas() {
  const src = store.state.source;
  if (!src) return null;
  if (!brushCanvas || brushCanvas.width !== src.width || brushCanvas.height !== src.height) {
    brushCanvas = document.createElement('canvas');
    brushCanvas.width = src.width;
    brushCanvas.height = src.height;
  }
  return brushCanvas;
}

/** 画像差し替え時にブラシをリセット。main から呼ぶ。 */
export function resetBrush() {
  brushCanvas = null;
  store.update({ brushDirty: (store.state.brushDirty | 0) + 1 });
}

/** ソースキャンバスのインタラクションをブラシ用に取り込む。 */
export function attachBrush({ host, sourceCanvas, getViewport }) {
  if (!host || !sourceCanvas) return;

  const onPointerDown = (e) => {
    const tool = store.state.ui.brushTool;
    if (tool !== 'paint' && tool !== 'erase') return;
    if (!store.state.source) return;
    drawing = true;
    host.setPointerCapture(e.pointerId);
    const p = clientToImage(e, sourceCanvas, getViewport());
    lastX = p.x;
    lastY = p.y;
    drawDot(p.x, p.y);
    store.update({ brushDirty: (store.state.brushDirty | 0) + 1 });
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const onPointerMove = (e) => {
    const tool = store.state.ui.brushTool;
    if (tool === 'paint' || tool === 'erase') {
      // ブラシモード中は viewport のパンを抑止
      e.stopImmediatePropagation();
    }
    if (!drawing) return;
    const p = clientToImage(e, sourceCanvas, getViewport());
    drawLine(lastX, lastY, p.x, p.y);
    lastX = p.x;
    lastY = p.y;
    // ライブ反映を間引く: ストロークごとに 1 回 + 終端で 1 回
    if (Math.random() < 0.4) {
      store.update({ brushDirty: (store.state.brushDirty | 0) + 1 });
    }
  };

  const end = (e) => {
    if (!drawing) return;
    drawing = false;
    try { host.releasePointerCapture(e.pointerId); } catch {}
    store.update({ brushDirty: (store.state.brushDirty | 0) + 1 });
  };

  host.addEventListener('pointerdown', onPointerDown, { capture: true });
  host.addEventListener('pointermove', onPointerMove, { capture: true });
  host.addEventListener('pointerup', end, { capture: true });
  host.addEventListener('pointercancel', end, { capture: true });

  // カーソル形状をモードで切替
  const updateCursor = () => {
    const tool = store.state.ui.brushTool;
    host.dataset.brushTool = tool;
  };
  store.subscribe(updateCursor);
}

/** 元画像座標系でブラシを 1 点打つ。 */
function drawDot(x, y) {
  const canvas = getBrushCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { brushTool, brushSize, brushHardness } = store.state.ui;
  const r = Math.max(0.5, brushSize / 2);
  const grad = ctx.createRadialGradient(x, y, r * Math.max(0, brushHardness), x, y, r);
  const fill = brushTool === 'paint' ? 'rgba(0,0,0,1)' : 'rgba(255,255,255,1)';
  const stop = brushTool === 'paint' ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0)';
  grad.addColorStop(0, fill);
  grad.addColorStop(1, stop);
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** 線形補間で密に dot を打つ。 */
function drawLine(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const r = Math.max(1, store.state.ui.brushSize / 4);
  const steps = Math.max(1, Math.ceil(dist / r));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    drawDot(x0 + dx * t, y0 + dy * t);
  }
}

/** クライアント座標 → 元画像ピクセル座標。viewport の transform を逆適用。 */
function clientToImage(e, sourceCanvas, vpState) {
  const rect = sourceCanvas.getBoundingClientRect();
  // canvas は viewport 内の transform 済み要素。boundingRect は実描画矩形。
  // よって rect.width / canvas.width = scale となり、(clientX - rect.left)/scale = imageX
  const scale = rect.width / sourceCanvas.width;
  const x = (e.clientX - rect.left) / scale;
  const y = (e.clientY - rect.top) / scale;
  void vpState;
  return { x, y };
}
