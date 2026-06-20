/* 図面データと座標系、幾何計算、スナップ、Undo/Redoを管理する中核。
 * stateの構造はrender.js・tools.js・dxf.jsで共有されるため、変更時は各参照先も確認する。 */

// 図面の永続データと、操作中だけ使う一時状態を同じオブジェクトで共有する。

export const state = {
  entities: [],
  layers: [
    { id: 'layer0', name: '0', color: '#c9d1d9', visible: true, locked: false, lineType: 'solid', lineWeight: 0.25 },
    { id: 'layer1', name: 'Construction', color: '#58a6ff', visible: true, locked: false, lineType: 'dashed', lineWeight: 0.18 },
    { id: 'layer2', name: 'Dimensions', color: '#f0b429', visible: true, locked: false, lineType: 'solid', lineWeight: 0.18 },
    { id: 'layer3', name: 'Notes', color: '#f87171', visible: true, locked: false, lineType: 'solid', lineWeight: 0.18 },
  ],
  activeLayerId: 'layer0',

  // view.x/yは画面上の原点位置、zoomはワールド単位から画面pxへの倍率。
  view: { x: 0, y: 0, zoom: 1 },

  // drawPhaseとdrawPointsは複数クリックを必要とするツール間で共通利用する。
  tool: 'SELECT',
  isDrawing: false,
  drawPhase: 0,         // Phase within a tool (e.g., 0=first click, 1=second click)
  drawPoints: [],       // Accumulated world-coord points for current op
  previewEntity: null,  // Entity shown as drawing preview

  // 選択IDは図形配列とは別管理し、保存データへ含めない。
  selectedIds: new Set(),
  selectionBox: null,   // { start:{x,y}, end:{x,y}, crossing:bool }

  // snapEnabledは図形スナップの切替で、グリッドスナップは無効時にも残す仕様。
  snapEnabled: true,
  snapPoint: null,      // { world:{x,y}, type:string } - current best snap
  gridEnabled: true,
  gridSize: 20,

  orthoEnabled: false,

  // ステータス表示とプレビュー用の最新ポインター位置。
  mouseWorld: { x: 0, y: 0 },
  mouseScreen: { x: 0, y: 0 },

  // パン開始時の画面座標。
  isPanning: false,
  panStart: null,       // { x, y } screen coords

  // 移動・複製で基準点を共有する。
  moveBase: null,       // base point in world coords

  textInsertPoint: null,
};

// ワールド座標は画面と同じY下向き。DXF出力時だけYを反転する。

let _idCounter = Date.now();
export const genId = () => (++_idCounter).toString(36);

export const worldToScreen = (wx, wy) => ({
  x: wx * state.view.zoom + state.view.x,
  y: wy * state.view.zoom + state.view.y,
});

export const screenToWorld = (sx, sy) => ({
  x: (sx - state.view.x) / state.view.zoom,
  y: (sy - state.view.y) / state.view.zoom,
});

// 図形判定で共有する幾何ユーティリティ。

export const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
export const angle2 = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
export const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function applyOrtho(start, curr) {
  const dx = Math.abs(curr.x - start.x);
  const dy = Math.abs(curr.y - start.y);
  return dx >= dy
    ? { x: curr.x, y: start.y }
    : { x: start.x, y: curr.y };
}

// ORTHO有効時は、始点から変化量が大きい軸だけを残す。
export function constrainPoint(start, curr) {
  if (state.orthoEnabled && start) return applyOrtho(start, curr);
  return curr;
}

// 円弧角度はY下向き座標系の時計回りとして保持し、SVGのsweep方向と揃える。
export function arcPath(cx, cy, r, startAngle, endAngle) {
  let sweep = endAngle - startAngle;
  // 角度差を0以上2π未満へ正規化し、0跨ぎの円弧も同じ判定にする。
  while (sweep < 0) sweep += Math.PI * 2;
  while (sweep >= Math.PI * 2) sweep -= Math.PI * 2;
  const largeArc = sweep > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  if (Math.abs(sweep) < 1e-6) return `M ${x1} ${y1}`;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

// 3点円弧の基礎計算。ほぼ一直線の場合は不安定になるためnullを返す。
export function circumcircle(p1, p2, p3) {
  const ax = p1.x, ay = p1.y;
  const bx = p2.x, by = p2.y;
  const cx = p3.x, cy = p3.y;
  const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(D) < 1e-10) return null;
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / D;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / D;
  return { cx: ux, cy: uy, r: Math.hypot(ax - ux, ay - uy) };
}

// 当たり判定の許容値は呼出側で画面pxからワールド単位へ換算する。
export function hitTest(ent, p, tolWorld) {
  switch (ent.type) {
    case 'line':
      return distToSegment(p, ent.start, ent.end) <= tolWorld;
    case 'polyline': {
      const pts = ent.closed ? [...ent.points, ent.points[0]] : ent.points;
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(p, pts[i], pts[i + 1]) <= tolWorld) return true;
      }
      return false;
    }
    case 'rect': {
      const x2 = ent.x + ent.width, y2 = ent.y + ent.height;
      const sides = [
        [{ x: ent.x, y: ent.y }, { x: x2, y: ent.y }],
        [{ x: x2, y: ent.y }, { x: x2, y: y2 }],
        [{ x: x2, y: y2 }, { x: ent.x, y: y2 }],
        [{ x: ent.x, y: y2 }, { x: ent.x, y: ent.y }],
      ];
      return sides.some(([a, b]) => distToSegment(p, a, b) <= tolWorld);
    }
    case 'circle':
      return Math.abs(dist(p, { x: ent.cx, y: ent.cy }) - ent.r) <= tolWorld;
    case 'arc': {
      const d = dist(p, { x: ent.cx, y: ent.cy });
      if (Math.abs(d - ent.r) > tolWorld) return false;
      const a = Math.atan2(p.y - ent.cy, p.x - ent.cx);
      return isAngleOnArc(a, ent.startAngle, ent.endAngle);
    }
    case 'text': {
      const tw = (ent.text.length * ent.fontSize * 0.6);
      const th = ent.fontSize;
      return p.x >= ent.x - tolWorld && p.x <= ent.x + tw + tolWorld &&
             p.y >= ent.y - th - tolWorld && p.y <= ent.y + tolWorld;
    }
    default:
      return false;
  }
}

// Y下向き時計回りの開始角から終了角までに対象角が含まれるか判定する。
function isAngleOnArc(a, startAngle, endAngle) {
  let sweep = endAngle - startAngle;
  while (sweep < 0) sweep += Math.PI * 2;
  let offset = a - startAngle;
  while (offset < 0) offset += Math.PI * 2;
  return offset <= sweep;
}

// 選択・全体表示に使う軸平行バウンディングボックスを返す。
export function entityBounds(ent) {
  switch (ent.type) {
    case 'line':
      return {
        minX: Math.min(ent.start.x, ent.end.x),
        minY: Math.min(ent.start.y, ent.end.y),
        maxX: Math.max(ent.start.x, ent.end.x),
        maxY: Math.max(ent.start.y, ent.end.y),
      };
    case 'polyline': {
      const xs = ent.points.map(p => p.x), ys = ent.points.map(p => p.y);
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
    }
    case 'rect':
      return { minX: Math.min(ent.x, ent.x + ent.width), minY: Math.min(ent.y, ent.y + ent.height), maxX: Math.max(ent.x, ent.x + ent.width), maxY: Math.max(ent.y, ent.y + ent.height) };
    case 'circle':
      return { minX: ent.cx - ent.r, minY: ent.cy - ent.r, maxX: ent.cx + ent.r, maxY: ent.cy + ent.r };
    case 'arc':
      return { minX: ent.cx - ent.r, minY: ent.cy - ent.r, maxX: ent.cx + ent.r, maxY: ent.cy + ent.r };
    case 'text':
      return { minX: ent.x, minY: ent.y - ent.fontSize, maxX: ent.x + ent.text.length * ent.fontSize * 0.6, maxY: ent.y };
    default:
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
}

// 元図形を変更せず、平行移動した複製を返す。
export function translateEntity(ent, dx, dy) {
  const e = JSON.parse(JSON.stringify(ent));
  switch (e.type) {
    case 'line':
      e.start.x += dx; e.start.y += dy;
      e.end.x += dx; e.end.y += dy;
      break;
    case 'polyline':
      e.points = e.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
      break;
    case 'rect':
      e.x += dx; e.y += dy;
      break;
    case 'circle':
    case 'arc':
      e.cx += dx; e.cy += dy;
      break;
    case 'text':
      e.x += dx; e.y += dy;
      break;
  }
  return e;
}

// 図形候補を優先度順に比較し、画面上12px以内の最適なスナップ点を返す。

const SNAP_SCREEN_TOLERANCE = 12;

export function computeSnapPoint(mouseWorld) {
  if (!state.snapEnabled) {
    // 図形スナップを切ってもグリッド入力は維持するCAD寄りの仕様。
    const gs = state.gridSize;
    const gx = Math.round(mouseWorld.x / gs) * gs;
    const gy = Math.round(mouseWorld.y / gs) * gs;
    return { world: { x: gx, y: gy }, type: 'grid' };
  }

  const tol = SNAP_SCREEN_TOLERANCE / state.view.zoom;
  const candidates = [];

  for (const ent of state.entities) {
    const layer = state.layers.find(l => l.id === ent.layerId);
    if (!layer || !layer.visible) continue;

    switch (ent.type) {
      case 'line':
        candidates.push({ point: ent.start, type: 'endpoint', pri: 1 });
        candidates.push({ point: ent.end, type: 'endpoint', pri: 1 });
        candidates.push({ point: midpoint(ent.start, ent.end), type: 'midpoint', pri: 2 });
        break;

      case 'polyline':
        for (let i = 0; i < ent.points.length; i++) {
          candidates.push({ point: ent.points[i], type: 'endpoint', pri: 1 });
          if (i < ent.points.length - 1)
            candidates.push({ point: midpoint(ent.points[i], ent.points[i + 1]), type: 'midpoint', pri: 2 });
        }
        if (ent.closed && ent.points.length > 1)
          candidates.push({ point: midpoint(ent.points[ent.points.length - 1], ent.points[0]), type: 'midpoint', pri: 2 });
        break;

      case 'rect': {
        const c = [
          { x: ent.x, y: ent.y },
          { x: ent.x + ent.width, y: ent.y },
          { x: ent.x + ent.width, y: ent.y + ent.height },
          { x: ent.x, y: ent.y + ent.height },
        ];
        c.forEach(p => candidates.push({ point: p, type: 'endpoint', pri: 1 }));
        for (let i = 0; i < 4; i++)
          candidates.push({ point: midpoint(c[i], c[(i + 1) % 4]), type: 'midpoint', pri: 2 });
        // 矩形中心も円中心と同じ優先度で候補にする。
        candidates.push({ point: { x: ent.x + ent.width / 2, y: ent.y + ent.height / 2 }, type: 'center', pri: 2 });
        break;
      }

      case 'circle':
        candidates.push({ point: { x: ent.cx, y: ent.cy }, type: 'center', pri: 1 });
        candidates.push({ point: { x: ent.cx + ent.r, y: ent.cy }, type: 'quadrant', pri: 2 });
        candidates.push({ point: { x: ent.cx - ent.r, y: ent.cy }, type: 'quadrant', pri: 2 });
        candidates.push({ point: { x: ent.cx, y: ent.cy + ent.r }, type: 'quadrant', pri: 2 });
        candidates.push({ point: { x: ent.cx, y: ent.cy - ent.r }, type: 'quadrant', pri: 2 });
        break;

      case 'arc': {
        candidates.push({ point: { x: ent.cx, y: ent.cy }, type: 'center', pri: 1 });
        candidates.push({ point: { x: ent.cx + ent.r * Math.cos(ent.startAngle), y: ent.cy + ent.r * Math.sin(ent.startAngle) }, type: 'endpoint', pri: 1 });
        candidates.push({ point: { x: ent.cx + ent.r * Math.cos(ent.endAngle), y: ent.cy + ent.r * Math.sin(ent.endAngle) }, type: 'endpoint', pri: 1 });
        const midA = (ent.startAngle + ent.endAngle) / 2;
        candidates.push({ point: { x: ent.cx + ent.r * Math.cos(midA), y: ent.cy + ent.r * Math.sin(midA) }, type: 'midpoint', pri: 2 });
        break;
      }
    }
  }

  // グリッドは図形端点・中心より低い優先度にする。
  const gs = state.gridSize;
  const gx = Math.round(mouseWorld.x / gs) * gs;
  const gy = Math.round(mouseWorld.y / gs) * gs;
  candidates.push({ point: { x: gx, y: gy }, type: 'grid', pri: 3 });

  // 距離より候補種別の優先度を先に比較する。
  let best = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = dist(mouseWorld, c.point);
    if (d < tol) {
      if (best === null || c.pri < best.pri || (c.pri === best.pri && d < bestDist)) {
        best = c;
        bestDist = d;
      }
    }
  }

  return best ? { world: best.point, type: best.type } : null;
}

// 履歴には図面とレイヤーだけを保存し、ズーム・選択・操作途中の状態は戻さない。

const MAX_HISTORY = 100;
let _historyStack = [];
let _historyIndex = -1;

export function takeSnapshot() {
  return {
    entities: JSON.parse(JSON.stringify(state.entities)),
    layers: JSON.parse(JSON.stringify(state.layers)),
    activeLayerId: state.activeLayerId,
  };
}

export function pushHistory() {
  // Undo後に新規編集した場合、分岐前のRedo履歴は破棄する。
  _historyStack = _historyStack.slice(0, _historyIndex + 1);
  _historyStack.push(takeSnapshot());
  if (_historyStack.length > MAX_HISTORY) _historyStack.shift();
  _historyIndex = _historyStack.length - 1;
}

export function undo() {
  if (_historyIndex > 0) {
    _historyIndex--;
    _restoreSnapshot(_historyStack[_historyIndex]);
    return true;
  }
  return false;
}

export function redo() {
  if (_historyIndex < _historyStack.length - 1) {
    _historyIndex++;
    _restoreSnapshot(_historyStack[_historyIndex]);
    return true;
  }
  return false;
}

export function canUndo() { return _historyIndex > 0; }
export function canRedo() { return _historyIndex < _historyStack.length - 1; }

function _restoreSnapshot(snap) {
  state.entities = JSON.parse(JSON.stringify(snap.entities));
  state.layers = JSON.parse(JSON.stringify(snap.layers));
  state.activeLayerId = snap.activeLayerId;
  state.selectedIds = new Set();
}

// 空図面を最初のUndo地点として登録する。
pushHistory();

// 全図形が余白付きで収まる倍率と原点位置を計算する。

export function zoomExtents(canvasW, canvasH) {
  if (state.entities.length === 0) {
    state.view = { x: canvasW / 2, y: canvasH / 2, zoom: 1 };
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ent of state.entities) {
    const b = entityBounds(ent);
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  const pw = maxX - minX, ph = maxY - minY;
  const margin = 40;
  const zoom = Math.min((canvasW - margin * 2) / (pw || 1), (canvasH - margin * 2) / (ph || 1));
  state.view.zoom = Math.max(0.01, Math.min(1000, zoom));
  state.view.x = canvasW / 2 - (minX + pw / 2) * state.view.zoom;
  state.view.y = canvasH / 2 - (minY + ph / 2) * state.view.zoom;
}

// 図形個別値が未指定の場合に、所属レイヤーの見た目を継承する。

export function getActiveLayer() {
  return state.layers.find(l => l.id === state.activeLayerId);
}

export function getEntityLayer(ent) {
  return state.layers.find(l => l.id === ent.layerId);
}

export function getEffectiveColor(ent) {
  if (ent.color) return ent.color;
  const layer = getEntityLayer(ent);
  return layer ? layer.color : '#c9d1d9';
}

export function getEffectiveLineType(ent) {
  if (ent.lineType) return ent.lineType;
  const layer = getEntityLayer(ent);
  return layer ? layer.lineType : 'solid';
}

export function getEffectiveLineWeight(ent) {
  if (ent.lineWeight != null) return ent.lineWeight;
  const layer = getEntityLayer(ent);
  return layer ? layer.lineWeight : 0.25;
}

// 新規図形へIDとアクティブレイヤーを付ける共通基底を生成する。
export function makeEntityBase(type) {
  return {
    id: genId(),
    type,
    layerId: state.activeLayerId,
    color: null,
    lineType: null,
    lineWeight: null,
  };
}

// オフセット・トリム・延長・フィレットで共有する交差計算。

// 2本の無限直線の交点と、各始点からの媒介変数を返す。平行時はnull。
export function lineLineIntersect(a1, a2, b1, b2) {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-10) return null;
  const dx3 = b1.x - a1.x, dy3 = b1.y - a1.y;
  const t1 = (dx3 * dy2 - dy3 * dx2) / denom;
  const t2 = (dx3 * dy1 - dy3 * dx1) / denom;
  return { x: a1.x + t1 * dx1, y: a1.y + t1 * dy1, t1, t2 };
}

// 両方の媒介変数が0〜1に入る場合だけ、線分同士の交点として返す。
export function segSegIntersect(a1, a2, b1, b2) {
  const r = lineLineIntersect(a1, a2, b1, b2);
  if (!r) return null;
  if (r.t1 < -1e-9 || r.t1 > 1 + 1e-9) return null;
  if (r.t2 < -1e-9 || r.t2 > 1 + 1e-9) return null;
  return { x: r.x, y: r.y };
}

// 無限直線と円の交点を返す。tは線分外も含むため、呼出側で用途別に絞る。
export function lineCircleIntersect(p1, p2, cx, cy, r) {
  const dx = p2.x - p1.x, dy = p2.y - p1.y;
  const fx = p1.x - cx, fy = p1.y - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-20) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return [];
  const sd = Math.sqrt(Math.max(0, disc));
  const results = [];
  for (const sign of [-1, 1]) {
    const t = (-b + sign * sd) / (2 * a);
    results.push({ x: p1.x + t * dx, y: p1.y + t * dy, t });
  }
  return results;
}

// 図形を線分群へ分解し、円・円弧だけ専用処理を加えて交点を列挙する。
export function intersectEntities(e1, e2) {
  const segs1 = entitySegments(e1);
  const segs2 = entitySegments(e2);
  const results = [];
  for (const s1 of segs1) {
    for (const s2 of segs2) {
      const p = segSegIntersect(s1.a, s1.b, s2.a, s2.b);
      if (p) results.push(p);
    }
  }
  // 円・円弧と線分の交差は線分同士の処理では得られないため別計算する。
  if (e1.type === 'circle' || e1.type === 'arc') {
    for (const s2 of segs2) {
      const pts = lineCircleIntersect(s2.a, s2.b, e1.cx, e1.cy, e1.r);
      for (const p of pts) {
        if (p.t >= -1e-9 && p.t <= 1 + 1e-9) {
          if (e1.type === 'arc') {
            const a = Math.atan2(p.y - e1.cy, p.x - e1.cx);
            if (!isAngleInArcRange(a, e1.startAngle, e1.endAngle)) continue;
          }
          results.push({ x: p.x, y: p.y });
        }
      }
    }
  }
  if (e2.type === 'circle' || e2.type === 'arc') {
    for (const s1 of segs1) {
      const pts = lineCircleIntersect(s1.a, s1.b, e2.cx, e2.cy, e2.r);
      for (const p of pts) {
        if (p.t >= -1e-9 && p.t <= 1 + 1e-9) {
          if (e2.type === 'arc') {
            const a = Math.atan2(p.y - e2.cy, p.x - e2.cx);
            if (!isAngleInArcRange(a, e2.startAngle, e2.endAngle)) continue;
          }
          results.push({ x: p.x, y: p.y });
        }
      }
    }
  }
  return results;
}

// Y下向き時計回りの円弧範囲に角度が入るか判定する。
export function isAngleInArcRange(a, startAngle, endAngle) {
  let sweep = endAngle - startAngle;
  while (sweep < 0) sweep += Math.PI * 2;
  let off = a - startAngle;
  while (off < 0) off += Math.PI * 2;
  return off <= sweep + 1e-9;
}

// 交差判定用に図形を線分群へ変換する。円と円弧は専用計算へ回す。
export function entitySegments(ent) {
  switch (ent.type) {
    case 'line':
      return [{ a: ent.start, b: ent.end }];
    case 'polyline': {
      const pts = ent.closed ? [...ent.points, ent.points[0]] : ent.points;
      const segs = [];
      for (let i = 0; i < pts.length - 1; i++) segs.push({ a: pts[i], b: pts[i + 1] });
      return segs;
    }
    case 'rect': {
      const x1 = ent.x, y1 = ent.y, x2 = ent.x + ent.width, y2 = ent.y + ent.height;
      return [
        { a: { x: x1, y: y1 }, b: { x: x2, y: y1 } },
        { a: { x: x2, y: y1 }, b: { x: x2, y: y2 } },
        { a: { x: x2, y: y2 }, b: { x: x1, y: y2 } },
        { a: { x: x1, y: y2 }, b: { x: x1, y: y1 } },
      ];
    }
    case 'circle': return [];
    case 'arc': return [];
    default: return [];
  }
}

// 始点→終点の左側を正として、指定距離だけ平行移動した線分を返す。
export function offsetLineSegment(a, b, d) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-10) return null;
  const nx = -dy / len, ny = dx / len;
  return {
    p1: { x: a.x + nx * d, y: a.y + ny * d },
    p2: { x: b.x + nx * d, y: b.y + ny * d },
  };
}

// 有向線分a→bに対して点pが左右どちら側にあるか符号で返す。
export function sideOfLine(p, a, b) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

// 点pを無限直線abへ射影し、射影点と媒介変数tを返す。
export function projectPointOnLine(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-20) return { point: { ...a }, t: 0 };
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  return { point: { x: a.x + t * dx, y: a.y + t * dy }, t };
}

// 角度を0以上2π未満へ正規化する。
export function normalizeAngle(a) {
  while (a < 0) a += Math.PI * 2;
  while (a >= Math.PI * 2) a -= Math.PI * 2;
  return a;
}
