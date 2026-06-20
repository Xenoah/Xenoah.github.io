/* stateをSVGへ投影する描画層。図面実体、操作プレビュー、選択・スナップ表示を重ねる。
 * 線幅や文字サイズはズームで太さが変わらないよう、原則として倍率の逆数を使う。 */

import {
  state, worldToScreen, screenToWorld,
  getEffectiveColor, getEffectiveLineType, getEffectiveLineWeight,
  arcPath,
} from './core.js';

// SVG要素生成と、レイヤー継承後の線スタイル適用。

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

// 破線ピッチもズームの逆数で補正し、画面上の見え方を一定にする。
function dashArray(lineType, scale = 1) {
  switch (lineType) {
    case 'dashed':  return `${12 * scale},${6 * scale}`;
    case 'dotted':  return `${2 * scale},${5 * scale}`;
    case 'center':  return `${20 * scale},${5 * scale},${2 * scale},${5 * scale}`;
    case 'phantom': return `${30 * scale},${5 * scale},${2 * scale},${5 * scale},${2 * scale},${5 * scale}`;
    default:        return 'none';
  }
}

function applyStroke(el, ent, overrideColor = null, extraWidth = 0) {
  const color = overrideColor || getEffectiveColor(ent);
  const lw = getEffectiveLineWeight(ent);
  const lt = getEffectiveLineType(ent);
  const strokeW = (lw / state.view.zoom) + extraWidth / state.view.zoom;
  el.setAttribute('stroke', color);
  el.setAttribute('stroke-width', strokeW);
  el.setAttribute('stroke-linecap', 'round');
  el.setAttribute('stroke-linejoin', 'round');
  const da = dashArray(lt, 1 / state.view.zoom);
  if (da !== 'none') el.setAttribute('stroke-dasharray', da);
  return el;
}

// 寸法線は図形データを変更せず、dimTypeごとの表示要素へ分解して描画する。

function _dimLine(g, x1, y1, x2, y2, color, lw) {
  svgEl('line', { x1, y1, x2, y2, stroke: color, 'stroke-width': lw, fill: 'none' }, g);
}

function _dimArrow(g, tip, ux, uy, size, color) {
  // ux/uyは矢印先端から胴体側への単位方向として扱う。
  const nx = -uy, ny = ux;
  const bx = tip.x + ux * size, by = tip.y + uy * size;
  svgEl('polygon', {
    points: `${tip.x},${tip.y} ${bx - nx * size * 0.35},${by - ny * size * 0.35} ${bx + nx * size * 0.35},${by + ny * size * 0.35}`,
    fill: color, stroke: 'none',
  }, g);
}

function _dimText(g, x, y, text, size, color, rotateDeg = 0) {
  const el = svgEl('text', {
    x, y,
    'font-size': size,
    'font-family': 'monospace',
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    fill: color,
  });
  if (rotateDeg) el.setAttribute('transform', `rotate(${rotateDeg},${x},${y})`);
  el.textContent = text;
  g.appendChild(el);
}

function _renderDim(g, ent, color) {
  const z = state.view.zoom;
  const lw = 0.7 / z;
  const as = 8 / z;
  const ts = 11 / z;
  const extGap = 1 / z;
  const extOver = 4 / z;

  if (ent.dimType === 'linear_h') {
    const { p1, p2, dimPt } = ent;
    const left = { x: Math.min(p1.x, p2.x), y: dimPt.y };
    const right = { x: Math.max(p1.x, p2.x), y: dimPt.y };
    const signY = dimPt.y < (p1.y + p2.y) / 2 ? -1 : 1;

    _dimLine(g, p1.x, p1.y - signY * extGap, p1.x, dimPt.y + signY * extOver, color, lw);
    _dimLine(g, p2.x, p2.y - signY * extGap, p2.x, dimPt.y + signY * extOver, color, lw);
    _dimLine(g, left.x, dimPt.y, right.x, dimPt.y, color, lw);
    _dimArrow(g, { x: left.x, y: dimPt.y }, 1, 0, as, color);
    _dimArrow(g, { x: right.x, y: dimPt.y }, -1, 0, as, color);
    const val = Math.abs(p2.x - p1.x).toFixed(3);
    _dimText(g, (left.x + right.x) / 2, dimPt.y - signY * (ts * 0.7), ent.textOverride || val, ts, color);

  } else if (ent.dimType === 'linear_v') {
    const { p1, p2, dimPt } = ent;
    const top = Math.min(p1.y, p2.y), bot = Math.max(p1.y, p2.y);
    const signX = dimPt.x < (p1.x + p2.x) / 2 ? -1 : 1;

    _dimLine(g, p1.x - signX * extGap, p1.y, dimPt.x + signX * extOver, p1.y, color, lw);
    _dimLine(g, p2.x - signX * extGap, p2.y, dimPt.x + signX * extOver, p2.y, color, lw);
    _dimLine(g, dimPt.x, top, dimPt.x, bot, color, lw);
    _dimArrow(g, { x: dimPt.x, y: top }, 0, 1, as, color);
    _dimArrow(g, { x: dimPt.x, y: bot }, 0, -1, as, color);
    const val = Math.abs(p2.y - p1.y).toFixed(3);
    _dimText(g, dimPt.x - signX * (ts * 0.7), (top + bot) / 2, ent.textOverride || val, ts, color, -90);

  } else if (ent.dimType === 'aligned') {
    const { p1, p2, dimPt } = ent;
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return;
    const ux = dx / len, uy = dy / len;
    const nx = -uy, ny = ux;

    const dot = (dimPt.x - p1.x) * nx + (dimPt.y - p1.y) * ny;
    const sgn = dot >= 0 ? 1 : -1;

    const dl1 = { x: p1.x + dot * nx, y: p1.y + dot * ny };
    const dl2 = { x: p2.x + dot * nx, y: p2.y + dot * ny };

    _dimLine(g,
      p1.x + sgn * extGap * nx, p1.y + sgn * extGap * ny,
      dl1.x + sgn * extOver * nx, dl1.y + sgn * extOver * ny, color, lw);
    _dimLine(g,
      p2.x + sgn * extGap * nx, p2.y + sgn * extGap * ny,
      dl2.x + sgn * extOver * nx, dl2.y + sgn * extOver * ny, color, lw);
    _dimLine(g, dl1.x, dl1.y, dl2.x, dl2.y, color, lw);
    _dimArrow(g, dl1, ux, uy, as, color);
    _dimArrow(g, dl2, -ux, -uy, as, color);

    const mid = { x: (dl1.x + dl2.x) / 2, y: (dl1.y + dl2.y) / 2 };
    const textX = mid.x + sgn * ts * 0.7 * nx;
    const textY = mid.y + sgn * ts * 0.7 * ny;
    const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
    // 寸法文字が上下逆にならないよう、角度が左向きなら180度反転する。
    const adjAngle = (angleDeg > 90 || angleDeg < -90) ? angleDeg + 180 : angleDeg;
    _dimText(g, textX, textY, ent.textOverride || len.toFixed(3), ts, color, adjAngle);

  } else if (ent.dimType === 'radius') {
    const { cx, cy, r, angle } = ent;
    const px = cx + r * Math.cos(angle), py = cy + r * Math.sin(angle);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    _dimLine(g, cx, cy, px, py, color, lw);
    _dimArrow(g, { x: px, y: py }, -ux, -uy, as, color);
    const text = ent.textOverride || `R ${r.toFixed(3)}`;
    const tx = cx + r * 0.55 * ux - uy * ts * 0.7;
    const ty = cy + r * 0.55 * uy + ux * ts * 0.7;
    _dimText(g, tx, ty, text, ts, color);

  } else if (ent.dimType === 'diameter') {
    const { cx, cy, r, angle } = ent;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const px1 = cx + r * ux, py1 = cy + r * uy;
    const px2 = cx - r * ux, py2 = cy - r * uy;
    _dimLine(g, px2, py2, px1, py1, color, lw);
    _dimArrow(g, { x: px1, y: py1 }, -ux, -uy, as, color);
    _dimArrow(g, { x: px2, y: py2 }, ux, uy, as, color);
    const text = ent.textOverride || `\u00D8 ${(r * 2).toFixed(3)}`;
    _dimText(g, cx - uy * ts * 0.8, cy + ux * ts * 0.8, text, ts, color);
  }
}

// 図形種別ごとにSVG要素へ変換する。

function createEntityElement(ent, isSelected = false, isPreview = false) {
  let el = null;
  const selColor = '#58a6ff';
  const selExtra = isSelected ? 1.5 : 0;

  switch (ent.type) {
    case 'line':
      el = svgEl('line', {
        x1: ent.start.x, y1: ent.start.y,
        x2: ent.end.x, y2: ent.end.y,
        fill: 'none',
      });
      break;

    case 'polyline': {
      const pts = ent.points.map(p => `${p.x},${p.y}`).join(' ');
      el = svgEl(ent.closed ? 'polygon' : 'polyline', {
        points: pts,
        fill: 'none',
      });
      break;
    }

    case 'rect':
      el = svgEl('rect', {
        x: ent.x, y: ent.y,
        width: Math.abs(ent.width), height: Math.abs(ent.height),
        // 逆方向に作図した矩形も、SVGへ正の幅・高さとして渡す。
        ...(ent.width < 0 ? { x: ent.x + ent.width } : {}),
        ...(ent.height < 0 ? { y: ent.y + ent.height } : {}),
        fill: 'none',
      });
      break;

    case 'circle':
      el = svgEl('circle', {
        cx: ent.cx, cy: ent.cy, r: Math.abs(ent.r),
        fill: 'none',
      });
      break;

    case 'arc':
      el = svgEl('path', {
        d: arcPath(ent.cx, ent.cy, ent.r, ent.startAngle, ent.endAngle),
        fill: 'none',
      });
      break;

    case 'text': {
      const textAttrs = {
        x: ent.x, y: ent.y,
        'font-size': ent.fontSize,
        'font-family': 'monospace',
        fill: isSelected ? selColor : getEffectiveColor(ent),
      };
      if (ent.angle) textAttrs.transform = `rotate(${ent.angle * 180 / Math.PI}, ${ent.x}, ${ent.y})`;
      el = svgEl('text', textAttrs);
      el.textContent = ent.text;
      return el; // Text doesn't use stroke
    }

    case 'hatch': {
      el = svgEl('polygon', {
        points: ent.boundary.map(p => `${p.x},${p.y}`).join(' '),
        fill: isSelected ? 'rgba(88,166,255,0.3)' : _hatchFill(ent, isSelected ? selColor : getEffectiveColor(ent)),
        stroke: 'none',
      });
      return el;
    }

    case 'dim': {
      const color = isSelected ? selColor : getEffectiveColor(ent);
      const g = svgEl('g');
      _renderDim(g, ent, color);
      return g;
    }

    default:
      return null;
  }

  if (!el) return null;

  if (isPreview) {
    el.setAttribute('stroke', '#fbbf24');
    el.setAttribute('stroke-width', 1.5 / state.view.zoom);
    el.setAttribute('stroke-dasharray', `${8 / state.view.zoom},${4 / state.view.zoom}`);
    el.setAttribute('fill', 'none');
  } else {
    applyStroke(el, ent, isSelected ? selColor : null, selExtra);
    // 選択中は元線の上へ太い透明線を重ね、細線でも操作しやすくする。
    if (isSelected) {
      el.setAttribute('filter', 'none');
    }
  }

  return el;
}

// 選択図形の主要点へ、画面上一定サイズのハンドルを描く。

function getEntityHandlePoints(ent) {
  switch (ent.type) {
    case 'line': return [ent.start, ent.end];
    case 'polyline': return ent.points;
    case 'rect': return [
      { x: ent.x, y: ent.y },
      { x: ent.x + ent.width, y: ent.y },
      { x: ent.x + ent.width, y: ent.y + ent.height },
      { x: ent.x, y: ent.y + ent.height },
    ];
    case 'circle': return [{ x: ent.cx, y: ent.cy }];
    case 'arc': return [
      { x: ent.cx, y: ent.cy },
      { x: ent.cx + ent.r * Math.cos(ent.startAngle), y: ent.cy + ent.r * Math.sin(ent.startAngle) },
      { x: ent.cx + ent.r * Math.cos(ent.endAngle), y: ent.cy + ent.r * Math.sin(ent.endAngle) },
    ];
    case 'text': return [{ x: ent.x, y: ent.y }];
    case 'dim':
      if (ent.p1) return [ent.p1, ent.p2, ent.dimPt].filter(Boolean);
      if (ent.cx !== undefined) return [{ x: ent.cx, y: ent.cy }];
      return [];
    default: return [];
  }
}

// ハッチングごとにSVG patternを生成し、fillのURL参照を返す。

function _hatchFill(ent, color) {
  if (ent.pattern === 'solid') return color;
  // 線・クロスパターンは図形ごとに一意なpattern IDを使う。
  const patId = `hatch-pat-${ent.id}`;
  const defs = document.querySelector('#cad-svg defs');
  if (!defs) return color;
  // 再描画時に同じIDが残らないよう、既存定義を先に除去する。
  const old = document.getElementById(patId);
  if (old) old.remove();

  const sp = ent.spacing / state.view.zoom;
  const pat = svgEl('pattern', {
    id: patId,
    width: sp, height: sp,
    patternUnits: 'userSpaceOnUse',
    patternTransform: `rotate(${ent.angle || 45})`,
  });
  svgEl('line', { x1: 0, y1: 0, x2: 0, y2: sp, stroke: color, 'stroke-width': 0.5 / state.view.zoom }, pat);
  if (ent.pattern === 'cross') {
    svgEl('line', { x1: 0, y1: 0, x2: sp, y2: 0, stroke: color, 'stroke-width': 0.5 / state.view.zoom }, pat);
  }
  defs.appendChild(pat);
  return `url(#${patId})`;
}

// 画面更新の入口。グリッド、図形、プレビュー、補助表示を順番に更新する。

const entitiesLayer = () => document.getElementById('entities-layer');
const previewLayer = () => document.getElementById('preview-layer');
const snapLayer = () => document.getElementById('snap-layer');
const selBoxLayer = () => document.getElementById('selection-box-layer');
const viewport = () => document.getElementById('viewport');
const gridRect = () => document.getElementById('grid-rect');
const gridPatternSmall = () => document.getElementById('grid-pattern-small');
const gridPatternLarge = () => document.getElementById('grid-pattern-large');

export function render() {
  renderViewport();
  renderGrid();
  renderEntities();
  renderPreview();
  renderSnapIndicator();
  renderSelectionBox();
}

// ワールド座標グループへパンとズームの変換を適用する。
function renderViewport() {
  const vp = viewport();
  if (vp) vp.setAttribute('transform', `translate(${state.view.x},${state.view.y}) scale(${state.view.zoom})`);
}

// グリッド原点と間隔をビュー変換へ追従させる。
function renderGrid() {
  const gr = gridRect();
  if (!state.gridEnabled) {
    if (gr) gr.setAttribute('fill', 'none');
    return;
  }
  if (gr) gr.setAttribute('fill', 'url(#grid-pattern-large)');

  const gs = Math.max(1, state.gridSize * state.view.zoom);
  const lg = gs * 5;

  // 細グリッド。
  const sp = gridPatternSmall();
  if (sp) {
    sp.setAttribute('width', gs);
    sp.setAttribute('height', gs);
    sp.setAttribute('x', state.view.x % gs);
    sp.setAttribute('y', state.view.y % gs);
    const path = sp.querySelector('path');
    if (path) path.setAttribute('d', `M ${gs} 0 L 0 0 0 ${gs}`);
  }

  // 5マスごとの主グリッド。
  const lp = gridPatternLarge();
  if (lp) {
    lp.setAttribute('width', lg);
    lp.setAttribute('height', lg);
    lp.setAttribute('x', state.view.x % lg);
    lp.setAttribute('y', state.view.y % lg);
    const path = lp.querySelector('path');
    if (path) path.setAttribute('d', `M ${lg} 0 L 0 0 0 ${lg}`);
    // 主グリッド内で参照する細グリッド定義も更新する。
    const inner = lp.querySelector('rect');
    if (inner) { inner.setAttribute('width', lg); inner.setAttribute('height', lg); }
  }
}

// 表示レイヤーの図形だけを描き、選択ハンドルを最後に重ねる。
function renderEntities() {
  const layer = entitiesLayer();
  if (!layer) return;
  layer.innerHTML = '';

  for (const ent of state.entities) {
    const entLayer = state.layers.find(l => l.id === ent.layerId);
    if (!entLayer || !entLayer.visible) continue;

    const isSelected = state.selectedIds.has(ent.id);
    const el = createEntityElement(ent, isSelected);
    if (!el) continue;

    el.dataset.id = ent.id;
    layer.appendChild(el);

    // 図形本体より前面へ選択ハンドルを描く。
    if (isSelected) {
      const handles = getEntityHandlePoints(ent);
      const hs = 4 / state.view.zoom;
      handles.forEach(p => {
        svgEl('rect', {
          x: p.x - hs / 2, y: p.y - hs / 2,
          width: hs, height: hs,
          fill: '#58a6ff',
          stroke: '#0d1117',
          'stroke-width': 0.5 / state.view.zoom,
        }, layer);
      });
    }
  }
}

// 多段作図中の未確定図形とガイド線をプレビューレイヤーへ描く。
export function renderPreview() {
  const layer = previewLayer();
  if (!layer) return;
  layer.innerHTML = '';

  if (state.previewEntity) {
    const el = createEntityElement(state.previewEntity, false, true);
    if (el) layer.appendChild(el);
  }

  // ポリラインは確定済み頂点列と現在カーソルまでを一続きで見せる。
  if ((state.tool === 'POLYLINE' || state.tool === 'LINE') && state.drawPoints.length > 0) {
    const pts = state.drawPoints;
    const curr = state.snapPoint ? state.snapPoint.world : state.mouseWorld;

    if (pts.length > 1) {
      const polyPts = pts.map(p => `${p.x},${p.y}`).join(' ');
      svgEl('polyline', {
        points: polyPts,
        fill: 'none',
        stroke: '#c9d1d9',
        'stroke-width': 1 / state.view.zoom,
        'stroke-linecap': 'round',
      }, layer);
    }

    // 確定済み頂点を小点で示す。
    pts.forEach(p => {
      svgEl('circle', {
        cx: p.x, cy: p.y,
        r: 2.5 / state.view.zoom,
        fill: '#fbbf24',
        stroke: 'none',
      }, layer);
    });
  }

  // 3点円弧は現在までに指定した点をガイド表示する。
  if (state.tool === 'ARC' && state.drawPoints.length > 0) {
    state.drawPoints.forEach(p => {
      svgEl('circle', {
        cx: p.x, cy: p.y,
        r: 2.5 / state.view.zoom,
        fill: '#fbbf24',
      }, layer);
    });
    if (state.drawPoints.length === 2) {
      // 2点目確定前は始点からカーソルまでを補助線で示す。
      const p1 = state.drawPoints[0];
      const curr = state.snapPoint ? state.snapPoint.world : state.mouseWorld;
      svgEl('line', {
        x1: p1.x, y1: p1.y, x2: curr.x, y2: curr.y,
        stroke: '#484f58',
        'stroke-width': 0.5 / state.view.zoom,
        'stroke-dasharray': `${4 / state.view.zoom},${3 / state.view.zoom}`,
      }, layer);
    }
  }
}

// スナップ種別ごとに形状を変え、端点・中点・中心・グリッドを識別する。
function renderSnapIndicator() {
  const layer = snapLayer();
  if (!layer) return;
  layer.innerHTML = '';

  const snap = state.snapPoint;
  if (!snap) return;

  const { x, y } = snap.world;
  const s = 5 / state.view.zoom;

  switch (snap.type) {
    case 'endpoint':
      svgEl('rect', {
        x: x - s, y: y - s, width: s * 2, height: s * 2,
        fill: 'none', stroke: '#fbbf24',
        'stroke-width': 1.5 / state.view.zoom,
        class: 'snap-indicator',
      }, layer);
      break;

    case 'midpoint':
      svgEl('polygon', {
        points: `${x},${y - s * 1.2} ${x - s},${y + s * 0.8} ${x + s},${y + s * 0.8}`,
        fill: 'none', stroke: '#fbbf24',
        'stroke-width': 1.5 / state.view.zoom,
        class: 'snap-indicator',
      }, layer);
      break;

    case 'center':
      svgEl('circle', {
        cx: x, cy: y, r: s,
        fill: 'none', stroke: '#fbbf24',
        'stroke-width': 1.5 / state.view.zoom,
        class: 'snap-indicator',
      }, layer);
      svgEl('line', { x1: x - s * 1.5, y1: y, x2: x + s * 1.5, y2: y, stroke: '#fbbf24', 'stroke-width': 0.8 / state.view.zoom }, layer);
      svgEl('line', { x1: x, y1: y - s * 1.5, x2: x, y2: y + s * 1.5, stroke: '#fbbf24', 'stroke-width': 0.8 / state.view.zoom }, layer);
      break;

    case 'quadrant':
      svgEl('polygon', {
        points: `${x},${y - s * 1.2} ${x + s},${y} ${x},${y + s * 1.2} ${x - s},${y}`,
        fill: 'none', stroke: '#fbbf24',
        'stroke-width': 1.5 / state.view.zoom,
        class: 'snap-indicator',
      }, layer);
      break;

    case 'grid':
      // グリッドだけは図形スナップと区別できる緑の十字を使う。
      svgEl('line', { x1: x - s, y1: y, x2: x + s, y2: y, stroke: '#4ade80', 'stroke-width': 0.8 / state.view.zoom }, layer);
      svgEl('line', { x1: x, y1: y - s, x2: x, y2: y + s, stroke: '#4ade80', 'stroke-width': 0.8 / state.view.zoom }, layer);
      break;
  }
}

// 完全包含と交差選択で枠色・塗りを変える。
function renderSelectionBox() {
  const layer = selBoxLayer();
  if (!layer) return;
  layer.innerHTML = '';

  const box = state.selectionBox;
  if (!box) return;

  const s = worldToScreen(box.start.x, box.start.y);
  const e = worldToScreen(box.end.x, box.end.y);
  const x = Math.min(s.x, e.x), y = Math.min(s.y, e.y);
  const w = Math.abs(e.x - s.x), h = Math.abs(e.y - s.y);

  const isCrossing = box.crossing;
  const strokeColor = isCrossing ? '#4ade80' : '#58a6ff';
  const fillColor = isCrossing ? 'rgba(74,222,128,0.06)' : 'rgba(88,166,255,0.06)';
  const da = isCrossing ? '6,4' : 'none';

  svgEl('rect', {
    x, y, width: w, height: h,
    fill: fillColor,
    stroke: strokeColor,
    'stroke-width': 1,
    'stroke-dasharray': da,
  }, layer);
}
