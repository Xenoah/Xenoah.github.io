/* 作図・編集ツールの状態機械をまとめる。
 * 各ツールはactivate/deactivateとポインター・キー入力の共通インターフェースを持つ。 */

import {
  state, genId, makeEntityBase, constrainPoint,
  circumcircle, arcPath, hitTest, translateEntity,
  pushHistory, dist, lineLineIntersect, segSegIntersect,
  lineCircleIntersect, intersectEntities, entitySegments,
  offsetLineSegment, sideOfLine, projectPointOnLine,
  normalizeAngle, isAngleInArcRange,
} from './core.js';
import { render } from './render.js';
import { log } from './ui.js';

// スナップ点がある場合は、常に生のポインター座標より優先する。

function resolvePoint(world, snap) {
  if (snap) return snap.world;
  return world;
}

function cancelDrawing() {
  state.isDrawing = false;
  state.drawPhase = 0;
  state.drawPoints = [];
  state.previewEntity = null;
  state.selectionBox = null;
  state.moveBase = null;
}

// 選択ツール。右方向ドラッグは完全包含、左方向ドラッグは交差選択として扱う。

export const selectTool = {
  activate() {
    state.tool = 'SELECT';
    document.getElementById('canvas-container').className =
      document.getElementById('canvas-container').className
        .replace(/\b(crosshair|select-mode|move-mode|text-mode|panning)\b/g, '').trim() + ' select-mode';
    log('Select: click entity or drag to box select');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);

    const tol = 8 / state.view.zoom;
    const visibleEnts = state.entities.filter(ent => {
      const l = state.layers.find(x => x.id === ent.layerId);
      return l && l.visible && !l.locked;
    });

    // 後に描画された図形ほど前面にあるため、配列を逆順に当たり判定する。
    const hit = visibleEnts.slice().reverse().find(ent => hitTest(ent, pt, tol));

    if (hit) {
      if (e.shiftKey) {
        // Shift時だけ既存選択へ追加・解除する。
        if (state.selectedIds.has(hit.id)) state.selectedIds.delete(hit.id);
        else state.selectedIds.add(hit.id);
      } else if (!state.selectedIds.has(hit.id)) {
        state.selectedIds = new Set([hit.id]);
      }
      // 図形上ではボックス選択を開始せず、クリック選択だけにする。
    } else {
      // 空白からのドラッグはボックス選択を開始する。
      if (!e.shiftKey) state.selectedIds = new Set();
      state.selectionBox = { start: pt, end: pt, crossing: false };
      state.isDrawing = true;
    }

    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing || !state.selectionBox) return;
    const pt = resolvePoint(world, snap);
    state.selectionBox.end = pt;
    // CAD慣例に合わせ、右から左へのドラッグを交差選択にする。
    state.selectionBox.crossing = pt.x < state.selectionBox.start.x;
    render();
  },

  onMouseUp(e, world, snap) {
    if (!state.isDrawing || !state.selectionBox) { state.isDrawing = false; return; }
    const box = state.selectionBox;
    state.selectionBox = null;
    state.isDrawing = false;

    const x1 = Math.min(box.start.x, box.end.x);
    const y1 = Math.min(box.start.y, box.end.y);
    const x2 = Math.max(box.start.x, box.end.x);
    const y2 = Math.max(box.start.y, box.end.y);

    // 微小ドラッグは空白クリックとして扱い、誤選択を防ぐ。
    if (Math.abs(x2 - x1) < 2 / state.view.zoom && Math.abs(y2 - y1) < 2 / state.view.zoom) {
      render();
      return;
    }

    const visibleEnts = state.entities.filter(ent => {
      const l = state.layers.find(lx => lx.id === ent.layerId);
      return l && l.visible && !l.locked;
    });

    for (const ent of visibleEnts) {
      const b = _entBounds(ent);
      let selected;
      if (box.crossing) {
        // 交差選択は境界と一部でも重なる図形を含める。
        selected = !(b.maxX < x1 || b.minX > x2 || b.maxY < y1 || b.minY > y2);
      } else {
        // 完全包含選択は全体が枠内に入る図形だけを含める。
        selected = b.minX >= x1 && b.maxX <= x2 && b.minY >= y1 && b.maxY <= y2;
      }
      if (selected) {
        if (e.shiftKey) {
          if (state.selectedIds.has(ent.id)) state.selectedIds.delete(ent.id);
          else state.selectedIds.add(ent.id);
        } else {
          state.selectedIds.add(ent.id);
        }
      }
    }

    render();
  },

  onKeyDown(e) {
    if (e.key === 'Escape') {
      state.selectedIds = new Set();
      cancelDrawing();
      render();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
    }
  },
};

function _entBounds(ent) {
  // 選択判定用の簡易バウンディングボックス。
  switch (ent.type) {
    case 'line': return { minX: Math.min(ent.start.x,ent.end.x), minY: Math.min(ent.start.y,ent.end.y), maxX: Math.max(ent.start.x,ent.end.x), maxY: Math.max(ent.start.y,ent.end.y) };
    case 'polyline': { const xs=ent.points.map(p=>p.x),ys=ent.points.map(p=>p.y); return {minX:Math.min(...xs),minY:Math.min(...ys),maxX:Math.max(...xs),maxY:Math.max(...ys)}; }
    case 'rect': return {minX:Math.min(ent.x,ent.x+ent.width),minY:Math.min(ent.y,ent.y+ent.height),maxX:Math.max(ent.x,ent.x+ent.width),maxY:Math.max(ent.y,ent.y+ent.height)};
    case 'circle': return {minX:ent.cx-ent.r,minY:ent.cy-ent.r,maxX:ent.cx+ent.r,maxY:ent.cy+ent.r};
    case 'arc': return {minX:ent.cx-ent.r,minY:ent.cy-ent.r,maxX:ent.cx+ent.r,maxY:ent.cy+ent.r};
    case 'text': return {minX:ent.x,minY:ent.y-ent.fontSize,maxX:ent.x+ent.text.length*ent.fontSize*0.6,maxY:ent.y};
    default: return {minX:0,minY:0,maxX:0,maxY:0};
  }
}

// 連続線分ツール。2点目を次の始点として保持し、取消まで連続作図する。

export const lineTool = {
  activate() {
    cancelDrawing();
    state.tool = 'LINE';
    log('Line: click start point');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const constPt = constrainPoint(state.drawPoints[state.drawPoints.length - 1] || null, pt);

    if (!state.isDrawing) {
      // 最初のクリックを始点として保持する。
      state.isDrawing = true;
      state.drawPoints = [constPt];
      state.previewEntity = { ...makeEntityBase('line'), start: constPt, end: constPt };
      log(`Line: start (${constPt.x.toFixed(2)}, ${constPt.y.toFixed(2)})`);
    } else {
      // 2点目で線分を確定し、その終点から次の線分を開始する。
      const start = state.drawPoints[state.drawPoints.length - 1];
      const end = constPt;
      const line = { ...makeEntityBase('line'), start: { ...start }, end: { ...end } };
      pushHistory();
      state.entities.push(line);
      state.drawPoints = [end]; // Continue from end
      state.previewEntity = { ...makeEntityBase('line'), start: end, end };
      log(`Line to (${end.x.toFixed(2)}, ${end.y.toFixed(2)})`);
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing) return;
    const raw = resolvePoint(world, snap);
    const prev = state.drawPoints[state.drawPoints.length - 1];
    const pt = constrainPoint(prev, raw);
    if (state.previewEntity) {
      state.previewEntity.start = prev;
      state.previewEntity.end = pt;
    }
    render();
  },

  onMouseUp() {},

  onKeyDown(e) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      cancelDrawing();
      render();
      e.preventDefault();
    }
  },
};

// ポリラインツール。複数頂点を一つの図形として保存する。

export const polylineTool = {
  activate() {
    cancelDrawing();
    state.tool = 'POLYLINE';
    log('Polyline: click first point (Enter=finish, C=close)');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const raw = resolvePoint(world, snap);
    const prev = state.drawPoints.length > 0 ? state.drawPoints[state.drawPoints.length - 1] : null;
    const pt = constrainPoint(prev, raw);

    if (!state.isDrawing) {
      state.isDrawing = true;
      state.drawPoints = [pt];
      log(`Polyline: start (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    } else {
      state.drawPoints.push(pt);
      log(`Polyline: add point (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    }

    // 確定済み頂点と現在位置から未確定プレビューを更新する。
    if (state.drawPoints.length >= 2) {
      state.previewEntity = {
        ...makeEntityBase('polyline'),
        points: [...state.drawPoints],
        closed: false,
      };
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing || state.drawPoints.length === 0) return;
    const raw = resolvePoint(world, snap);
    const prev = state.drawPoints[state.drawPoints.length - 1];
    const pt = constrainPoint(prev, raw);

    if (state.drawPoints.length >= 1) {
      state.previewEntity = {
        ...makeEntityBase('polyline'),
        points: [...state.drawPoints, pt],
        closed: false,
      };
    }
    render();
  },

  onMouseUp() {},

  _finish(close = false) {
    if (!state.isDrawing || state.drawPoints.length < 2) {
      cancelDrawing();
      render();
      return;
    }
    const ent = {
      ...makeEntityBase('polyline'),
      points: [...state.drawPoints],
      closed: close,
    };
    pushHistory();
    state.entities.push(ent);
    log(`Polyline: ${ent.points.length} points${close ? ' (closed)' : ''}`);
    cancelDrawing();
    render();
  },

  onKeyDown(e) {
    if (e.key === 'Escape') {
      cancelDrawing(); render(); e.preventDefault();
    }
    if (e.key === 'Enter' || e.key === ' ') {
      this._finish(false); e.preventDefault();
    }
    if (e.key.toLowerCase() === 'c' && state.isDrawing && state.drawPoints.length >= 3) {
      this._finish(true); e.preventDefault();
    }
  },
};

// 対角2点から矩形を作る。逆方向入力は負の幅・高さとして保持できる。

export const rectTool = {
  activate() {
    cancelDrawing();
    state.tool = 'RECT';
    log('Rectangle: click first corner');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);

    if (!state.isDrawing) {
      state.isDrawing = true;
      state.drawPoints = [pt];
      log(`Rect: first corner (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    } else {
      const start = state.drawPoints[0];
      const ent = {
        ...makeEntityBase('rect'),
        x: start.x, y: start.y,
        width: pt.x - start.x,
        height: pt.y - start.y,
      };
      pushHistory();
      state.entities.push(ent);
      log(`Rect: ${Math.abs(ent.width).toFixed(2)} x ${Math.abs(ent.height).toFixed(2)}`);
      cancelDrawing();
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing) return;
    const pt = resolvePoint(world, snap);
    const start = state.drawPoints[0];
    state.previewEntity = {
      ...makeEntityBase('rect'),
      x: start.x, y: start.y,
      width: pt.x - start.x,
      height: pt.y - start.y,
    };
    render();
  },

  onMouseUp() {},
  onKeyDown(e) { if (e.key === 'Escape') { cancelDrawing(); render(); e.preventDefault(); } },
};

// 中心と円周上の1点から半径を決める。

export const circleTool = {
  activate() {
    cancelDrawing();
    state.tool = 'CIRCLE';
    log('Circle: click center point');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);

    if (!state.isDrawing) {
      state.isDrawing = true;
      state.drawPoints = [pt];
      log(`Circle: center (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    } else {
      const center = state.drawPoints[0];
      const r = dist(center, pt);
      if (r < 0.001) { log('Circle: radius too small'); return; }
      const ent = { ...makeEntityBase('circle'), cx: center.x, cy: center.y, r };
      pushHistory();
      state.entities.push(ent);
      log(`Circle: r=${r.toFixed(2)}`);
      cancelDrawing();
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing) return;
    const pt = resolvePoint(world, snap);
    const center = state.drawPoints[0];
    const r = dist(center, pt);
    state.previewEntity = { ...makeEntityBase('circle'), cx: center.x, cy: center.y, r };
    render();
  },

  onMouseUp() {},
  onKeyDown(e) { if (e.key === 'Escape') { cancelDrawing(); render(); e.preventDefault(); } },
};

// 始点・円弧上点・終点の3点から円弧を決める。

export const arcTool = {
  activate() {
    cancelDrawing();
    state.tool = 'ARC';
    state.drawPhase = 0;
    log('Arc: click start point');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);

    if (state.drawPhase === 0) {
      state.drawPoints = [pt];
      state.drawPhase = 1;
      state.isDrawing = true;
      log(`Arc: start (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    } else if (state.drawPhase === 1) {
      state.drawPoints.push(pt);
      state.drawPhase = 2;
      log(`Arc: mid (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    } else if (state.drawPhase === 2) {
      state.drawPoints.push(pt);
      const [p1, p2, p3] = state.drawPoints;
      const circle = circumcircle(p1, p2, p3);
      if (!circle) { log('Arc: points are collinear'); cancelDrawing(); render(); return; }
      const startAngle = Math.atan2(p1.y - circle.cy, p1.x - circle.cx);
      const endAngle = Math.atan2(p3.y - circle.cy, p3.x - circle.cx);
      const ent = {
        ...makeEntityBase('arc'),
        cx: circle.cx, cy: circle.cy, r: circle.r,
        startAngle, endAngle,
      };
      pushHistory();
      state.entities.push(ent);
      log(`Arc: r=${circle.r.toFixed(2)}`);
      cancelDrawing();
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing) return;
    const pt = resolvePoint(world, snap);

    if (state.drawPhase === 1 && state.drawPoints.length === 1) {
      // 2点目までは円を確定できないため、始点からの補助線だけを表示する。
      state.previewEntity = {
        ...makeEntityBase('line'),
        start: state.drawPoints[0],
        end: pt,
      };
    } else if (state.drawPhase === 2 && state.drawPoints.length === 2) {
      const [p1, p2] = state.drawPoints;
      const circle = circumcircle(p1, p2, pt);
      if (circle) {
        const startAngle = Math.atan2(p1.y - circle.cy, p1.x - circle.cx);
        const endAngle = Math.atan2(pt.y - circle.cy, pt.x - circle.cx);
        state.previewEntity = {
          ...makeEntityBase('arc'),
          cx: circle.cx, cy: circle.cy, r: circle.r,
          startAngle, endAngle,
        };
      }
    }
    render();
  },

  onMouseUp() {},
  onKeyDown(e) { if (e.key === 'Escape') { cancelDrawing(); render(); e.preventDefault(); } },
};

// 挿入点を決めた後、HTMLの入力オーバーレイでIME対応文字列を受ける。

export const textTool = {
  activate() {
    cancelDrawing();
    state.tool = 'TEXT';
    log('Text: click insertion point');
  },
  deactivate() {
    cancelDrawing();
    _hideTextInput();
  },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    state.textInsertPoint = pt;
    _showTextInput(e.clientX, e.clientY);
  },

  onMouseMove() {},
  onMouseUp() {},
  onKeyDown(e) { if (e.key === 'Escape') { _hideTextInput(); cancelDrawing(); render(); } },
};

function _showTextInput(clientX, clientY) {
  const overlay = document.getElementById('text-input-overlay');
  const input = document.getElementById('text-content-input');
  const container = document.getElementById('canvas-container');
  const rect = container.getBoundingClientRect();
  overlay.style.left = Math.min(clientX - rect.left, rect.width - 220) + 'px';
  overlay.style.top = Math.min(clientY - rect.top - 80, rect.height - 100) + 'px';
  overlay.classList.remove('hidden');
  input.value = '';
  input.focus();
}

function _hideTextInput() {
  document.getElementById('text-input-overlay').classList.add('hidden');
}

export function commitText(textContent) {
  _hideTextInput();
  if (!textContent.trim() || !state.textInsertPoint) return;
  const ent = {
    ...makeEntityBase('text'),
    x: state.textInsertPoint.x,
    y: state.textInsertPoint.y,
    text: textContent,
    fontSize: 14, // world units
    angle: 0,
  };
  pushHistory();
  state.entities.push(ent);
  log(`Text: "${textContent}"`);
  state.textInsertPoint = null;
  render();
}

// 選択図形を基準点から移動先まで平行移動する。

export const moveTool = {
  _origEntities: null,

  activate() {
    cancelDrawing();
    state.tool = 'MOVE';
    if (state.selectedIds.size === 0) {
      log('Move: select entities first, then press M');
    } else {
      log(`Move: click base point (${state.selectedIds.size} selected)`);
    }
  },
  deactivate() {
    cancelDrawing();
    this._origEntities = null;
  },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    if (state.selectedIds.size === 0) return;
    const pt = resolvePoint(world, snap);

    if (!state.isDrawing) {
      state.isDrawing = true;
      state.moveBase = pt;
      // プレビュー中に何度も移動できるよう、開始時の図形を退避する。
      this._origEntities = {};
      for (const id of state.selectedIds) {
        const ent = state.entities.find(x => x.id === id);
        if (ent) this._origEntities[id] = JSON.parse(JSON.stringify(ent));
      }
      log(`Move: base point (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    } else {
      // 確定時だけ履歴へ積み、退避データを破棄する。
      const base = state.moveBase;
      const dx = pt.x - base.x;
      const dy = pt.y - base.y;
      pushHistory();
      for (const id of state.selectedIds) {
        const idx = state.entities.findIndex(x => x.id === id);
        if (idx >= 0) {
          state.entities[idx] = translateEntity(state.entities[idx], dx, dy);
        }
      }
      log(`Move: dx=${dx.toFixed(2)}, dy=${dy.toFixed(2)}`);
      cancelDrawing();
      this._origEntities = null;
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing || !state.moveBase || !this._origEntities) return;
    const pt = resolvePoint(world, snap);
    const constPt = constrainPoint(state.moveBase, pt);
    const dx = constPt.x - state.moveBase.x;
    const dy = constPt.y - state.moveBase.y;

    // マウス移動中は退避元から毎回計算し、誤差の累積を防ぐ。
    for (const id of state.selectedIds) {
      const idx = state.entities.findIndex(x => x.id === id);
      if (idx >= 0 && this._origEntities[id]) {
        state.entities[idx] = translateEntity(this._origEntities[id], dx, dy);
      }
    }
    render();
  },

  onMouseUp() {},
  onKeyDown(e) {
    if (e.key === 'Escape') {
      // キャンセル時は退避した図形へ戻す。
      if (this._origEntities) {
        for (const id of state.selectedIds) {
          const idx = state.entities.findIndex(x => x.id === id);
          if (idx >= 0 && this._origEntities[id]) {
            state.entities[idx] = JSON.parse(JSON.stringify(this._origEntities[id]));
          }
        }
        this._origEntities = null;
      }
      cancelDrawing();
      render();
      e.preventDefault();
    }
  },
};

// 選択図形を複製し、元図形を残したまま移動プレビューする。

export const copyTool = {
  _origEntities: null,

  activate() {
    cancelDrawing();
    state.tool = 'COPY';
    if (state.selectedIds.size === 0) {
      log('Copy: select entities first, then press CP');
    } else {
      log(`Copy: click base point (${state.selectedIds.size} selected)`);
    }
  },
  deactivate() {
    cancelDrawing();
    this._origEntities = null;
  },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    if (state.selectedIds.size === 0) return;
    const pt = resolvePoint(world, snap);

    if (!state.isDrawing) {
      state.isDrawing = true;
      state.moveBase = pt;
      this._origEntities = {};
      for (const id of state.selectedIds) {
        const ent = state.entities.find(x => x.id === id);
        if (ent) this._origEntities[id] = JSON.parse(JSON.stringify(ent));
      }
      log(`Copy: base point (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})`);
    } else {
      const base = state.moveBase;
      const dx = pt.x - base.x;
      const dy = pt.y - base.y;
      pushHistory();
      const newIds = new Set();
      for (const id of state.selectedIds) {
        const orig = this._origEntities[id];
        if (!orig) continue;
        const copy = translateEntity(orig, dx, dy);
        copy.id = genId();
        state.entities.push(copy);
        newIds.add(copy.id);
      }
      // プレビュー用に一時変更した元図形を確定前に戻す。
      for (const id of state.selectedIds) {
        const idx = state.entities.findIndex(x => x.id === id);
        if (idx >= 0 && this._origEntities[id]) {
          state.entities[idx] = JSON.parse(JSON.stringify(this._origEntities[id]));
        }
      }
      state.selectedIds = newIds;
      log(`Copied ${newIds.size} entities`);
      // 一度確定後も同じ基準点から連続複製できる状態を維持する。
      state.isDrawing = false;
      state.moveBase = null;
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (!state.isDrawing || !state.moveBase || !this._origEntities) return;
    const pt = resolvePoint(world, snap);
    const constPt = constrainPoint(state.moveBase, pt);
    const dx = constPt.x - state.moveBase.x;
    const dy = constPt.y - state.moveBase.y;

    // 専用プレビュー形式がないため、一時的に図形配列上の複製を移動する。
    state.previewEntity = null;
    // キャンセル時は退避元へ戻すため、確定前の変更は履歴へ積まない。
    for (const id of state.selectedIds) {
      const idx = state.entities.findIndex(x => x.id === id);
      if (idx >= 0 && this._origEntities[id]) {
        state.entities[idx] = translateEntity(this._origEntities[id], dx, dy);
      }
    }
    render();
  },

  onMouseUp() {},
  onKeyDown(e) {
    if (e.key === 'Escape') {
      if (this._origEntities) {
        for (const id of state.selectedIds) {
          const idx = state.entities.findIndex(x => x.id === id);
          if (idx >= 0 && this._origEntities[id]) {
            state.entities[idx] = JSON.parse(JSON.stringify(this._origEntities[id]));
          }
        }
        this._origEntities = null;
      }
      cancelDrawing();
      render();
      e.preventDefault();
    }
    if (e.key === 'Enter') {
      cancelDrawing();
      this._origEntities = null;
      render();
      e.preventDefault();
    }
  },
};

// 削除・全選択など単発で完了する操作。

export function deleteSelected() {
  if (state.selectedIds.size === 0) return;
  pushHistory();
  state.entities = state.entities.filter(e => !state.selectedIds.has(e.id));
  const count = state.selectedIds.size;
  state.selectedIds = new Set();
  log(`Deleted ${count} entit${count === 1 ? 'y' : 'ies'}`);
  render();
}

export function selectAll() {
  state.selectedIds = new Set(
    state.entities
      .filter(ent => {
        const l = state.layers.find(x => x.id === ent.layerId);
        return l && l.visible && !l.locked;
      })
      .map(e => e.id)
  );
  render();
}

// app.jsがツール名から共通インターフェースを引けるよう登録する。

// 図形選択後、クリックした側へ指定距離の平行図形を作る。

export const offsetTool = {
  _distance: 20,
  _entity: null,

  activate() {
    cancelDrawing();
    state.tool = 'OFFSET';
    state.drawPhase = 0;
    log(`Offset: enter distance (current: ${this._distance}) then click entity`);
  },
  deactivate() { cancelDrawing(); this._entity = null; },

  setDistance(d) {
    if (d > 0) { this._distance = d; log(`Offset distance: ${d}`); }
  },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const tol = 8 / state.view.zoom;

    if (state.drawPhase === 0) {
      // 1回目のクリックで対象図形を決める。
      const ent = _pickEntity(pt, tol);
      if (!ent) { log('Offset: click an entity (line, circle, or arc)'); return; }
      if (!['line', 'circle', 'arc'].includes(ent.type)) {
        log('Offset: only works on lines, circles, arcs'); return;
      }
      this._entity = ent;
      state.drawPhase = 1;
      log('Offset: click on the side to offset toward');
    } else if (state.drawPhase === 1 && this._entity) {
      // 2回目のクリック位置からオフセット方向を決める。
      const ent = this._entity;
      const d = this._distance;
      let newEnt = null;

      if (ent.type === 'line') {
        const side = sideOfLine(pt, ent.start, ent.end);
        const sign = side >= 0 ? 1 : -1;
        const off = offsetLineSegment(ent.start, ent.end, sign * d);
        if (off) newEnt = { ...makeEntityBase('line'), layerId: ent.layerId, color: ent.color, lineType: ent.lineType, lineWeight: ent.lineWeight, start: off.p1, end: off.p2 };
      } else if (ent.type === 'circle') {
        const distFromCenter = dist(pt, { x: ent.cx, y: ent.cy });
        const newR = distFromCenter > ent.r ? ent.r + d : ent.r - d;
        if (newR > 0) newEnt = { ...makeEntityBase('circle'), layerId: ent.layerId, color: ent.color, lineType: ent.lineType, lineWeight: ent.lineWeight, cx: ent.cx, cy: ent.cy, r: newR };
      } else if (ent.type === 'arc') {
        const distFromCenter = dist(pt, { x: ent.cx, y: ent.cy });
        const newR = distFromCenter > ent.r ? ent.r + d : ent.r - d;
        if (newR > 0) newEnt = { ...makeEntityBase('arc'), layerId: ent.layerId, color: ent.color, lineType: ent.lineType, lineWeight: ent.lineWeight, cx: ent.cx, cy: ent.cy, r: newR, startAngle: ent.startAngle, endAngle: ent.endAngle };
      }

      if (newEnt) {
        pushHistory();
        state.entities.push(newEnt);
        log(`Offset: created at distance ${d}`);
        render();
        // 同一図形から続けて別側へ作成できるよう対象選択を維持する。
        state.drawPhase = 1;
      }
    }
    render();
  },

  onMouseMove(e, world, snap) {
    if (state.drawPhase !== 1 || !this._entity) return;
    const pt = resolvePoint(world, snap);
    const ent = this._entity;
    const d = this._distance;

    if (ent.type === 'line') {
      const side = sideOfLine(pt, ent.start, ent.end);
      const sign = side >= 0 ? 1 : -1;
      const off = offsetLineSegment(ent.start, ent.end, sign * d);
      if (off) state.previewEntity = { ...makeEntityBase('line'), start: off.p1, end: off.p2 };
    } else if (ent.type === 'circle') {
      const distFromCenter = dist(pt, { x: ent.cx, y: ent.cy });
      const newR = distFromCenter > ent.r ? ent.r + d : ent.r - d;
      if (newR > 0) state.previewEntity = { ...makeEntityBase('circle'), cx: ent.cx, cy: ent.cy, r: newR };
    } else if (ent.type === 'arc') {
      const distFromCenter = dist(pt, { x: ent.cx, y: ent.cy });
      const newR = distFromCenter > ent.r ? ent.r + d : ent.r - d;
      if (newR > 0) state.previewEntity = { ...makeEntityBase('arc'), cx: ent.cx, cy: ent.cy, r: newR, startAngle: ent.startAngle, endAngle: ent.endAngle };
    }
    render();
  },

  onMouseUp() {},
  onKeyDown(e) {
    if (e.key === 'Escape') { cancelDrawing(); this._entity = null; render(); e.preventDefault(); }
  },
};

// 他の表示図形との交点で区間を分け、クリックした区間だけを除去する。

export const trimTool = {
  activate() {
    cancelDrawing();
    state.tool = 'TRIM';
    log('Trim: click the part of an entity to remove');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const tol = 8 / state.view.zoom;

    // クリック位置に最も近い対象図形を選ぶ。
    const visEnts = _visibleUnlockedEnts();
    const target = visEnts.slice().reverse().find(ent => hitTest(ent, pt, tol));
    if (!target) { log('Trim: click on an entity to trim'); return; }

    // 非表示レイヤーを除いた他図形を切断境界として使う。
    const cutters = visEnts.filter(e => e.id !== target.id);

    if (target.type === 'line') {
      _trimLine(target, pt, cutters);
    } else if (target.type === 'circle') {
      _trimCircle(target, pt, cutters);
    } else if (target.type === 'arc') {
      _trimArc(target, pt, cutters);
    } else {
      log('Trim: cannot trim this entity type');
    }
    render();
  },

  onMouseMove() {},
  onMouseUp() {},
  onKeyDown(e) { if (e.key === 'Escape') { cancelDrawing(); render(); e.preventDefault(); } },
};

function _trimLine(ent, clickPt, cutters) {
  // 線分上の交点を媒介変数tへ変換して順序付ける。
  const params = [0, 1];

  for (const cutter of cutters) {
    const pts = intersectEntities(ent, cutter);
    for (const p of pts) {
      const { t } = projectPointOnLine(p, ent.start, ent.end);
      if (t > 1e-9 && t < 1 - 1e-9) params.push(t);
    }
  }
  params.sort((a, b) => a - b);

  if (params.length <= 2) { log('Trim: no intersections found'); return; }

  // クリック位置を含む交点間区間を削除対象にする。
  const { t: clickT } = projectPointOnLine(clickPt, ent.start, ent.end);
  let segIdx = 0;
  for (let i = 0; i < params.length - 1; i++) {
    if (clickT >= params[i] - 1e-9 && clickT <= params[i + 1] + 1e-9) { segIdx = i; break; }
  }

  // 元図形を除き、残った区間を別線分として再登録する。
  pushHistory();
  const idx = state.entities.findIndex(e => e.id === ent.id);
  if (idx < 0) return;
  state.entities.splice(idx, 1);

  const dx = ent.end.x - ent.start.x, dy = ent.end.y - ent.start.y;
  for (let i = 0; i < params.length - 1; i++) {
    if (i === segIdx) continue; // skip trimmed segment
    const t0 = params[i], t1 = params[i + 1];
    const p0 = { x: ent.start.x + t0 * dx, y: ent.start.y + t0 * dy };
    const p1 = { x: ent.start.x + t1 * dx, y: ent.start.y + t1 * dy };
    state.entities.push({ ...makeEntityBase('line'), start: p0, end: p1,
      layerId: ent.layerId, color: ent.color, lineType: ent.lineType, lineWeight: ent.lineWeight });
  }
  log('Trim: line trimmed');
}

function _trimCircle(ent, clickPt, cutters) {
  // 円は交点角度で分割し、削除区間以外を円弧として残す。
  const intAngles = [];
  for (const cutter of cutters) {
    const segs = entitySegments(cutter);
    for (const seg of segs) {
      const pts = lineCircleIntersect(seg.a, seg.b, ent.cx, ent.cy, ent.r);
      for (const p of pts) {
        if (p.t >= -1e-9 && p.t <= 1 + 1e-9) {
          intAngles.push(normalizeAngle(Math.atan2(p.y - ent.cy, p.x - ent.cx)));
        }
      }
    }
  }
  if (intAngles.length < 2) { log('Trim: circle needs at least 2 cutting edges'); return; }
  intAngles.sort((a, b) => a - b);

  // クリック角度を含む円弧区間を選ぶ。
  const clickAngle = normalizeAngle(Math.atan2(clickPt.y - ent.cy, clickPt.x - ent.cx));
  let segIdx = 0;
  for (let i = 0; i < intAngles.length; i++) {
    const a0 = intAngles[i];
    let diff = clickAngle - a0;
    while (diff < 0) diff += Math.PI * 2;
    let span;
    if (i < intAngles.length - 1) {
      span = intAngles[i + 1] - a0;
    } else {
      span = (2 * Math.PI - a0) + intAngles[0];
    }
    if (diff <= span + 1e-9) { segIdx = i; break; }
  }

  pushHistory();
  const idx = state.entities.findIndex(e => e.id === ent.id);
  if (idx < 0) return;
  state.entities.splice(idx, 1);

  for (let i = 0; i < intAngles.length; i++) {
    if (i === segIdx) continue;
    const a0 = intAngles[i], a1 = intAngles[(i + 1) % intAngles.length];
    state.entities.push({ ...makeEntityBase('arc'), cx: ent.cx, cy: ent.cy, r: ent.r,
      startAngle: a0, endAngle: a1,
      layerId: ent.layerId, color: ent.color, lineType: ent.lineType, lineWeight: ent.lineWeight });
  }
  log('Trim: circle trimmed to arcs');
}

function _trimArc(ent, clickPt, cutters) {
  const intAngles = [];
  for (const cutter of cutters) {
    const segs = entitySegments(cutter);
    for (const seg of segs) {
      const pts = lineCircleIntersect(seg.a, seg.b, ent.cx, ent.cy, ent.r);
      for (const p of pts) {
        if (p.t >= -1e-9 && p.t <= 1 + 1e-9) {
          const a = normalizeAngle(Math.atan2(p.y - ent.cy, p.x - ent.cx));
          if (isAngleInArcRange(a, ent.startAngle, ent.endAngle)) intAngles.push(a);
        }
      }
    }
  }
  if (intAngles.length === 0) { log('Trim: no intersections on arc'); return; }

  const startA = normalizeAngle(ent.startAngle);
  const params = [startA, ...intAngles.filter(a => a !== startA), normalizeAngle(ent.endAngle)];
  params.sort((a, b) => a - b);

  const clickA = normalizeAngle(Math.atan2(clickPt.y - ent.cy, clickPt.x - ent.cx));
  let segIdx = 0;
  for (let i = 0; i < params.length - 1; i++) {
    let diff = clickA - params[i];
    while (diff < 0) diff += Math.PI * 2;
    const span = params[i + 1] - params[i];
    if (diff <= span + 1e-9) { segIdx = i; break; }
  }

  pushHistory();
  const idx = state.entities.findIndex(e => e.id === ent.id);
  if (idx < 0) return;
  state.entities.splice(idx, 1);

  for (let i = 0; i < params.length - 1; i++) {
    if (i === segIdx) continue;
    state.entities.push({ ...makeEntityBase('arc'), cx: ent.cx, cy: ent.cy, r: ent.r,
      startAngle: params[i], endAngle: params[i + 1],
      layerId: ent.layerId, color: ent.color, lineType: ent.lineType, lineWeight: ent.lineWeight });
  }
  log('Trim: arc trimmed');
}

// 線分のクリック側端点を、最も近い境界交点まで延長する。

export const extendTool = {
  activate() {
    cancelDrawing();
    state.tool = 'EXTEND';
    log('Extend: click near endpoint of line to extend');
  },
  deactivate() { cancelDrawing(); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const tol = 20 / state.view.zoom;

    const visEnts = _visibleUnlockedEnts();
    // 端点に近い線分を優先し、どちら側を延長するか同時に決める。
    let target = null;
    let bestDist = tol;
    let useEnd = true;

    for (const ent of visEnts) {
      if (ent.type !== 'line') continue;
      const dStart = dist(pt, ent.start);
      const dEnd = dist(pt, ent.end);
      if (dStart < bestDist) { bestDist = dStart; target = ent; useEnd = false; }
      if (dEnd < bestDist) { bestDist = dEnd; target = ent; useEnd = true; }
    }

    if (!target) { log('Extend: click near an endpoint of a line'); return; }

    // 現在端点より外側にある交点だけから最短距離を選ぶ。
    const fixedPt = useEnd ? target.start : target.end;
    const movingPt = useEnd ? target.end : target.start;
    const cutters = visEnts.filter(e => e.id !== target.id);

    let bestT = Infinity;
    let bestIntersect = null;

    for (const cutter of cutters) {
      const segs = entitySegments(cutter);
      for (const seg of segs) {
        const r = lineLineIntersect(fixedPt, movingPt, seg.a, seg.b);
        if (!r) continue;
        // 対象線では端点外、境界線では線分内にある交点だけを採用する。
        if (r.t1 > 1 + 1e-9 && r.t2 >= -1e-9 && r.t2 <= 1 + 1e-9) {
          if (r.t1 < bestT) { bestT = r.t1; bestIntersect = { x: r.x, y: r.y }; }
        }
      }
      if (cutter.type === 'circle' || cutter.type === 'arc') {
        const pts = lineCircleIntersect(fixedPt, movingPt, cutter.cx, cutter.cy, cutter.r);
        for (const p of pts) {
          if (p.t > 1 + 1e-9) {
            if (cutter.type === 'arc') {
              const a = normalizeAngle(Math.atan2(p.y - cutter.cy, p.x - cutter.cx));
              if (!isAngleInArcRange(a, cutter.startAngle, cutter.endAngle)) continue;
            }
            if (p.t < bestT) { bestT = p.t; bestIntersect = { x: p.x, y: p.y }; }
          }
        }
      }
    }

    if (!bestIntersect) { log('Extend: no boundary found in that direction'); return; }

    pushHistory();
    const idx = state.entities.findIndex(x => x.id === target.id);
    if (idx < 0) return;
    const updated = JSON.parse(JSON.stringify(target));
    if (useEnd) updated.end = bestIntersect;
    else updated.start = bestIntersect;
    state.entities[idx] = updated;
    log('Extend: line extended');
    render();
  },

  onMouseMove() {},
  onMouseUp() {},
  onKeyDown(e) { if (e.key === 'Escape') { cancelDrawing(); render(); e.preventDefault(); } },
};

// 2線分を接線位置まで切り詰め、指定半径の接続円弧を作る。

export const filletTool = {
  _radius: 10,
  _firstEnt: null,

  activate() {
    cancelDrawing();
    state.tool = 'FILLET';
    state.drawPhase = 0;
    log(`Fillet: r=${this._radius}. Enter radius or click first line`);
  },
  deactivate() { cancelDrawing(); this._firstEnt = null; },

  setRadius(r) { this._radius = Math.max(0, r); log(`Fillet radius: ${this._radius}`); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const tol = 8 / state.view.zoom;

    if (state.drawPhase === 0) {
      const ent = _pickEntity(pt, tol, ['line']);
      if (!ent) { log('Fillet: click first line'); return; }
      this._firstEnt = ent;
      state.drawPhase = 1;
      log('Fillet: click second line');
    } else if (state.drawPhase === 1 && this._firstEnt) {
      const ent2 = _pickEntity(pt, tol, ['line']);
      if (!ent2 || ent2.id === this._firstEnt.id) { log('Fillet: click a different line'); return; }
      _applyFillet(this._firstEnt, ent2, this._radius);
      this._firstEnt = null;
      state.drawPhase = 0;
      render();
    }
  },

  onMouseMove() {},
  onMouseUp() {},
  onKeyDown(e) {
    if (e.key === 'Escape') { cancelDrawing(); this._firstEnt = null; render(); e.preventDefault(); }
  },
};

function _applyFillet(e1, e2, r) {
  const inter = lineLineIntersect(e1.start, e1.end, e2.start, e2.end);
  if (!inter) { log('Fillet: lines are parallel'); return; }

  if (r === 0) {
    // 半径0は面取りせず、両線を交点まで延長・短縮して角を作る。
    pushHistory();
    const i1 = state.entities.findIndex(x => x.id === e1.id);
    const i2 = state.entities.findIndex(x => x.id === e2.id);
    if (i1 < 0 || i2 < 0) return;
    const P = { x: inter.x, y: inter.y };
    // 各線分の交点に近い端点だけを置き換える。
    const u1 = JSON.parse(JSON.stringify(e1));
    const u2 = JSON.parse(JSON.stringify(e2));
    if (dist(P, e1.end) < dist(P, e1.start)) u1.end = P; else u1.start = P;
    if (dist(P, e2.end) < dist(P, e2.start)) u2.end = P; else u2.start = P;
    state.entities[i1] = u1;
    state.entities[i2] = u2;
    log('Fillet: sharp corner (r=0)');
    return;
  }

  // 2線の角度二等分線から円弧中心と接点を求める。
  const ang1 = Math.atan2(e1.end.y - e1.start.y, e1.end.x - e1.start.x);
  const ang2 = Math.atan2(e2.end.y - e2.start.y, e2.end.x - e2.start.x);

  const P = { x: inter.x, y: inter.y };
  let bisA = (ang1 + ang2) / 2;

  let dA = ang2 - ang1;
  while (dA < -Math.PI) dA += 2 * Math.PI;
  while (dA > Math.PI) dA -= 2 * Math.PI;
  const halfA = Math.abs(dA) / 2;
  if (halfA < 1e-6 || Math.abs(halfA - Math.PI / 2) < 1e-6) { log('Fillet: unable to fillet'); return; }

  const arcDist = r / Math.sin(halfA); // distance from P to arc center
  const tanDist = r / Math.tan(halfA); // distance from P to tangent points

  // 二等分線の両方向を試し、元線分内に接点が収まる候補を優先する。
  let bestCenter = null;
  let bestT1 = 0, bestT2 = 0;
  for (const sign of [1, -1]) {
    const cx = P.x + Math.cos(bisA + sign * Math.PI / 2) * arcDist;
    const cy = P.y + Math.sin(bisA + sign * Math.PI / 2) * arcDist;

    const { t: t1 } = projectPointOnLine({ x: cx, y: cy }, e1.start, e1.end);
    const { t: t2 } = projectPointOnLine({ x: cx, y: cy }, e2.start, e2.end);
    const tp1 = { x: e1.start.x + t1 * (e1.end.x - e1.start.x), y: e1.start.y + t1 * (e1.end.y - e1.start.y) };
    const tp2 = { x: e2.start.x + t2 * (e2.end.x - e2.start.x), y: e2.start.y + t2 * (e2.end.y - e2.start.y) };

    // 数値誤差で指定半径から外れる候補は除外する。
    const r1 = dist({ x: cx, y: cy }, tp1);
    const r2 = dist({ x: cx, y: cy }, tp2);
    if (Math.abs(r1 - r) > r * 0.1 || Math.abs(r2 - r) > r * 0.1) continue;

    // 両接点が元線分上にある候補を有効とする。
    bestCenter = { x: cx, y: cy };
    bestT1 = t1; bestT2 = t2;
    break;
  }

  if (!bestCenter) {
    // 有効候補がない場合は、交点近傍の簡易候補へフォールバックする。
    const cx = P.x + Math.cos(bisA) * arcDist;
    const cy = P.y + Math.sin(bisA) * arcDist;
    bestCenter = { x: cx, y: cy };
    bestT1 = projectPointOnLine(bestCenter, e1.start, e1.end).t;
    bestT2 = projectPointOnLine(bestCenter, e2.start, e2.end).t;
  }

  pushHistory();
  const i1 = state.entities.findIndex(x => x.id === e1.id);
  const i2 = state.entities.findIndex(x => x.id === e2.id);
  if (i1 < 0 || i2 < 0) return;

  const u1 = JSON.parse(JSON.stringify(e1));
  const u2 = JSON.parse(JSON.stringify(e2));

  // 元線分の交点側端点を接点へ置き換える。
  if (bestT1 < 0.5) u1.start = { x: e1.start.x + bestT1 * (e1.end.x - e1.start.x), y: e1.start.y + bestT1 * (e1.end.y - e1.start.y) };
  else u1.end = { x: e1.start.x + bestT1 * (e1.end.x - e1.start.x), y: e1.start.y + bestT1 * (e1.end.y - e1.start.y) };

  if (bestT2 < 0.5) u2.start = { x: e2.start.x + bestT2 * (e2.end.x - e2.start.x), y: e2.start.y + bestT2 * (e2.end.y - e2.start.y) };
  else u2.end = { x: e2.start.x + bestT2 * (e2.end.x - e2.start.x), y: e2.start.y + bestT2 * (e2.end.y - e2.start.y) };

  state.entities[i1] = u1;
  state.entities[i2] = u2;

  // 採用中心を基準に2接点間の円弧を追加する。
  const tp1 = (bestT1 < 0.5) ? u1.start : u1.end;
  const tp2 = (bestT2 < 0.5) ? u2.start : u2.end;
  const startA = Math.atan2(tp1.y - bestCenter.y, tp1.x - bestCenter.x);
  const endA = Math.atan2(tp2.y - bestCenter.y, tp2.x - bestCenter.x);

  state.entities.push({
    ...makeEntityBase('arc'),
    cx: bestCenter.x, cy: bestCenter.y, r,
    startAngle: startA, endAngle: endA,
  });
  log(`Fillet: r=${r} applied`);
}

// 交差選択枠内の端点だけを移動し、図形全体の平行移動とは区別する。

export const stretchTool = {
  _stretchBox: null,
  _stretchedEnts: null,
  _origEnts: null,

  activate() {
    cancelDrawing();
    state.tool = 'STRETCH';
    state.drawPhase = 0;
    log('Stretch: drag crossing window (right-to-left) around endpoints to move');
  },
  deactivate() { cancelDrawing(); this._stretchBox = null; this._stretchedEnts = null; this._origEnts = null; },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);

    if (state.drawPhase === 0) {
      // 最初に変形対象端点を選ぶ交差枠を作る。
      state.isDrawing = true;
      state.selectionBox = { start: pt, end: pt, crossing: true };
    } else if (state.drawPhase === 1) {
      // 次に変形量の基準点を指定する。
      state.moveBase = pt;
      state.drawPhase = 2;
      log(`Stretch: base (${pt.x.toFixed(2)},${pt.y.toFixed(2)}). Click destination`);
      // プレビュー復元用に元図形を退避する。
      this._origEnts = {};
      for (const id of Object.keys(this._stretchedEnts || {})) {
        const ent = state.entities.find(x => x.id === id);
        if (ent) this._origEnts[id] = JSON.parse(JSON.stringify(ent));
      }
    } else if (state.drawPhase === 2 && state.moveBase) {
      const constPt = constrainPoint(state.moveBase, pt);
      const dx = constPt.x - state.moveBase.x;
      const dy = constPt.y - state.moveBase.y;
      pushHistory();
      _applyStretch(this._stretchedEnts, dx, dy);
      log(`Stretch: applied dx=${dx.toFixed(2)} dy=${dy.toFixed(2)}`);
      cancelDrawing();
      this._stretchBox = null;
      this._stretchedEnts = null;
      this._origEnts = null;
      render();
    }
  },

  onMouseMove(e, world, snap) {
    const pt = resolvePoint(world, snap);

    if (state.drawPhase === 0 && state.isDrawing && state.selectionBox) {
      state.selectionBox.end = pt;
      state.selectionBox.crossing = pt.x < state.selectionBox.start.x;
      render();
    } else if (state.drawPhase === 2 && state.moveBase && this._origEnts) {
      const constPt = constrainPoint(state.moveBase, pt);
      const dx = constPt.x - state.moveBase.x;
      const dy = constPt.y - state.moveBase.y;
      // 枠内端点だけへ一時変位を適用する。
      for (const [id, se] of Object.entries(this._stretchedEnts || {})) {
        const orig = this._origEnts[id];
        if (!orig) continue;
        const idx = state.entities.findIndex(x => x.id === id);
        if (idx < 0) continue;
        state.entities[idx] = _stretchEntity(orig, se, dx, dy);
      }
      render();
    }
  },

  onMouseUp(e, world, snap) {
    if (state.drawPhase === 0 && state.isDrawing && state.selectionBox) {
      const box = state.selectionBox;
      state.selectionBox = null;
      state.isDrawing = false;

      const x1 = Math.min(box.start.x, box.end.x), y1 = Math.min(box.start.y, box.end.y);
      const x2 = Math.max(box.start.x, box.end.x), y2 = Math.max(box.start.y, box.end.y);
      if (Math.abs(x2 - x1) < 2 / state.view.zoom) { render(); return; }

      // 各図形種別から選択枠内の可動端点を抽出する。
      this._stretchedEnts = {};
      for (const ent of _visibleUnlockedEnts()) {
        const se = _getStretchEndpoints(ent, x1, y1, x2, y2);
        if (se && Object.keys(se).length > 0) this._stretchedEnts[ent.id] = se;
      }

      if (Object.keys(this._stretchedEnts).length === 0) {
        log('Stretch: no endpoints in window'); state.drawPhase = 0; render(); return;
      }
      state.drawPhase = 1;
      log(`Stretch: ${Object.keys(this._stretchedEnts).length} entities. Click base point`);
      render();
    }
  },

  onKeyDown(e) {
    if (e.key === 'Escape') {
      if (this._origEnts) {
        for (const [id, orig] of Object.entries(this._origEnts)) {
          const idx = state.entities.findIndex(x => x.id === id);
          if (idx >= 0) state.entities[idx] = JSON.parse(JSON.stringify(orig));
        }
      }
      cancelDrawing(); this._stretchBox = null; this._stretchedEnts = null; this._origEnts = null;
      render(); e.preventDefault();
    }
  },
};

// 図形ごとに、選択枠内へ入った端点をフラグ化する。
function _getStretchEndpoints(ent, x1, y1, x2, y2) {
  const inBox = p => p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
  const se = {};
  if (ent.type === 'line') {
    if (inBox(ent.start)) se.start = true;
    if (inBox(ent.end)) se.end = true;
  } else if (ent.type === 'polyline') {
    ent.points.forEach((p, i) => { if (inBox(p)) se[i] = true; });
  } else if (ent.type === 'circle' || ent.type === 'arc') {
    if (inBox({ x: ent.cx, y: ent.cy })) se.center = true;
  } else if (ent.type === 'rect') {
    if (inBox({ x: ent.x, y: ent.y })) se.origin = true;
  }
  return se;
}

// 指定フラグの端点だけへ変位を適用した図形を返す。
function _stretchEntity(orig, se, dx, dy) {
  const e = JSON.parse(JSON.stringify(orig));
  if (e.type === 'line') {
    if (se.start) { e.start.x += dx; e.start.y += dy; }
    if (se.end) { e.end.x += dx; e.end.y += dy; }
  } else if (e.type === 'polyline') {
    e.points = e.points.map((p, i) => se[i] ? { x: p.x + dx, y: p.y + dy } : p);
  } else if (e.type === 'circle' || e.type === 'arc') {
    if (se.center) { e.cx += dx; e.cy += dy; }
  } else if (e.type === 'rect') {
    if (se.origin) { e.x += dx; e.y += dy; }
  }
  return e;
}

function _applyStretch(stretchedEnts, dx, dy) {
  for (const [id, se] of Object.entries(stretchedEnts || {})) {
    const idx = state.entities.findIndex(x => x.id === id);
    if (idx < 0) continue;
    state.entities[idx] = _stretchEntity(state.entities[idx], se, dx, dy);
  }
}

// 選択図形を行列状に複製し、元図形を先頭要素として残す。

export const arrayTool = {
  _rows: 3,
  _cols: 3,
  _rowSpacing: 50,
  _colSpacing: 50,

  activate() {
    cancelDrawing();
    state.tool = 'ARRAY';
    log(`Array: select entities then press Enter. Current: ${this._rows}x${this._cols}, spacing: ${this._rowSpacing}/${this._colSpacing}`);
    if (state.selectedIds.size > 0) {
      log(`Array: ${state.selectedIds.size} selected. Enter config as rows,cols in command line`);
    }
  },
  deactivate() { cancelDrawing(); },

  configure(rows, cols, rowSpacing, colSpacing) {
    this._rows = Math.max(1, rows);
    this._cols = Math.max(1, cols);
    this._rowSpacing = rowSpacing;
    this._colSpacing = colSpacing;
  },

  apply() {
    if (state.selectedIds.size === 0) { log('Array: select entities first'); return; }
    const srcEnts = state.entities.filter(e => state.selectedIds.has(e.id));
    if (srcEnts.length === 0) return;

    pushHistory();
    const newIds = new Set(state.selectedIds);
    for (let row = 0; row < this._rows; row++) {
      for (let col = 0; col < this._cols; col++) {
        if (row === 0 && col === 0) continue; // skip original
        const dx = col * this._colSpacing;
        const dy = row * this._rowSpacing;
        for (const src of srcEnts) {
          const copy = JSON.parse(JSON.stringify(src));
          copy.id = genId();
          // 行・列番号と間隔から各複製の変位を計算する。
          if (copy.type === 'line') { copy.start.x += dx; copy.start.y += dy; copy.end.x += dx; copy.end.y += dy; }
          else if (copy.type === 'polyline') copy.points = copy.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
          else if (copy.type === 'rect') { copy.x += dx; copy.y += dy; }
          else if (copy.type === 'circle' || copy.type === 'arc') { copy.cx += dx; copy.cy += dy; }
          else if (copy.type === 'text') { copy.x += dx; copy.y += dy; }
          else if (copy.type === 'hatch') { copy.boundary = copy.boundary.map(p => ({ x: p.x + dx, y: p.y + dy })); }
          state.entities.push(copy);
          newIds.add(copy.id);
        }
      }
    }
    state.selectedIds = newIds;
    const totalNew = newIds.size - srcEnts.length;
    log(`Array: ${this._rows}x${this._cols} complete (${totalNew} new entities)`);
    render();
  },

  onMouseDown() {},
  onMouseMove() {},
  onMouseUp() {},
  onKeyDown(e) {
    if (e.key === 'Escape') { cancelDrawing(); render(); e.preventDefault(); }
    if (e.key === 'Enter') { this.apply(); e.preventDefault(); }
  },
};

// 閉じた図形へ表示用ハッチ情報を付加する。

export const hatchTool = {
  _pattern: 'solid',
  _angle: 45,
  _spacing: 15,

  activate() {
    cancelDrawing();
    state.tool = 'HATCH';
    log(`Hatch: select closed entity and press Enter, or click inside. Pattern: ${this._pattern}`);
  },
  deactivate() { cancelDrawing(); },

  setPattern(p) { this._pattern = p; log(`Hatch pattern: ${p}`); },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const tol = 8 / state.view.zoom;

    // まずクリック位置の閉じた図形を探す。
    const visEnts = _visibleUnlockedEnts();
    const target = visEnts.slice().reverse().find(ent =>
      (ent.type === 'rect' || ent.type === 'circle' ||
       (ent.type === 'polyline' && ent.closed)) && hitTest(ent, pt, tol)
    );

    if (target) {
      _applyHatch(target, this._pattern, this._angle, this._spacing);
    } else {
      // 見つからない場合は、既に選択された閉図形を対象にする。
      if (state.selectedIds.size > 0) {
        for (const id of state.selectedIds) {
          const ent = state.entities.find(e => e.id === id);
          if (ent && (ent.type === 'rect' || ent.type === 'circle' || (ent.type === 'polyline' && ent.closed))) {
            _applyHatch(ent, this._pattern, this._angle, this._spacing);
          }
        }
      } else {
        log('Hatch: click a closed entity (rect, circle, closed polyline)');
      }
    }
    render();
  },

  apply() {
    // 選択集合のうち閉じた図形だけへ適用する。
    for (const id of state.selectedIds) {
      const ent = state.entities.find(e => e.id === id);
      if (ent && (ent.type === 'rect' || ent.type === 'circle' || (ent.type === 'polyline' && ent.closed))) {
        _applyHatch(ent, this._pattern, this._angle, this._spacing);
      }
    }
    render();
  },

  onMouseMove() {},
  onMouseUp() {},
  onKeyDown(e) {
    if (e.key === 'Enter') { this.apply(); e.preventDefault(); }
    if (e.key === 'Escape') { cancelDrawing(); render(); e.preventDefault(); }
  },
};

function _applyHatch(ent, pattern, angle, spacing) {
  let boundary = [];
  if (ent.type === 'rect') {
    boundary = [
      { x: ent.x, y: ent.y },
      { x: ent.x + ent.width, y: ent.y },
      { x: ent.x + ent.width, y: ent.y + ent.height },
      { x: ent.x, y: ent.y + ent.height },
    ];
  } else if (ent.type === 'polyline' && ent.closed) {
    boundary = [...ent.points];
  } else if (ent.type === 'circle') {
    // ハッチ境界計算用に円を多角形へ近似する。
    const N = 64;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      boundary.push({ x: ent.cx + ent.r * Math.cos(a), y: ent.cy + ent.r * Math.sin(a) });
    }
  }

  if (boundary.length < 3) { log('Hatch: boundary too simple'); return; }

  pushHistory();
  state.entities.push({
    ...makeEntityBase('hatch'),
    boundary,
    pattern,
    angle,
    spacing,
  });
  log(`Hatch: ${pattern} fill applied`);
}

// 複数ツールで共有する図形検索・入力補助。

function _visibleUnlockedEnts() {
  return state.entities.filter(ent => {
    const l = state.layers.find(x => x.id === ent.layerId);
    return l && l.visible && !l.locked;
  });
}

function _pickEntity(pt, tol, types = null) {
  const ents = _visibleUnlockedEnts();
  return ents.slice().reverse().find(ent =>
    (!types || types.includes(ent.type)) && hitTest(ent, pt, tol)
  );
}

// 寸法ツール群。参照点と寸法線位置を図形データとして保持する。

export const dimLinearTool = {
  _phase: 0, _p1: null, _p2: null,

  activate() {
    state.tool = 'DIMLINEAR';
    this._phase = 0; this._p1 = null; this._p2 = null;
    state.previewEntity = null;
    log('DimLinear: pick first point');
  },
  deactivate() { this._phase = 0; this._p1 = null; this._p2 = null; state.previewEntity = null; },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    if (this._phase === 0) {
      this._p1 = pt;
      this._phase = 1;
      log('DimLinear: pick second point');
    } else if (this._phase === 1) {
      this._p2 = pt;
      this._phase = 2;
      log('DimLinear: click to place dimension line');
    } else if (this._phase === 2) {
      const { dimType } = this._getDimType(pt);
      pushHistory();
      state.entities.push({
        ...makeEntityBase('dim'),
        dimType,
        p1: this._p1, p2: this._p2, dimPt: pt,
        textOverride: null,
      });
      log(`DimLinear: placed ${dimType === 'linear_h' ? 'horizontal' : 'vertical'} dimension`);
      this._phase = 0; this._p1 = null; this._p2 = null;
      state.previewEntity = null;
      render();
    }
  },

  onMouseMove(e, world, snap) {
    if (this._phase < 2 || !this._p1 || !this._p2) return;
    const pt = resolvePoint(world, snap);
    const { dimType } = this._getDimType(pt);
    state.previewEntity = {
      ...makeEntityBase('dim'), dimType,
      p1: this._p1, p2: this._p2, dimPt: pt, textOverride: null,
    };
    render();
  },

  _getDimType(pt) {
    const mid = { x: (this._p1.x + this._p2.x) / 2, y: (this._p1.y + this._p2.y) / 2 };
    const absDx = Math.abs(pt.x - mid.x), absDy = Math.abs(pt.y - mid.y);
    return { dimType: absDy >= absDx ? 'linear_h' : 'linear_v' };
  },

  onKeyDown(e) {
    if (e.key === 'Escape') { this.deactivate(); render(); e.preventDefault(); }
  },
};

export const dimAlignedTool = {
  _phase: 0, _p1: null, _p2: null,

  activate() {
    state.tool = 'DIMALIGNED';
    this._phase = 0; this._p1 = null; this._p2 = null;
    state.previewEntity = null;
    log('DimAligned: pick first point');
  },
  deactivate() { this._phase = 0; this._p1 = null; this._p2 = null; state.previewEntity = null; },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    if (this._phase === 0) {
      this._p1 = pt; this._phase = 1;
      log('DimAligned: pick second point');
    } else if (this._phase === 1) {
      this._p2 = pt; this._phase = 2;
      log('DimAligned: click to place dimension line');
    } else {
      pushHistory();
      state.entities.push({
        ...makeEntityBase('dim'),
        dimType: 'aligned',
        p1: this._p1, p2: this._p2, dimPt: pt, textOverride: null,
      });
      log('DimAligned: placed');
      this.deactivate(); render();
    }
  },

  onMouseMove(e, world, snap) {
    if (this._phase < 2) return;
    const pt = resolvePoint(world, snap);
    state.previewEntity = {
      ...makeEntityBase('dim'), dimType: 'aligned',
      p1: this._p1, p2: this._p2, dimPt: pt, textOverride: null,
    };
    render();
  },

  onKeyDown(e) {
    if (e.key === 'Escape') { this.deactivate(); render(); e.preventDefault(); }
  },
};

export const dimRadiusTool = {
  _phase: 0, _cx: 0, _cy: 0, _r: 0,

  activate() {
    state.tool = 'DIMRADIUS';
    this._phase = 0; state.previewEntity = null;
    log('DimRadius: click on circle or arc');
  },
  deactivate() { this._phase = 0; state.previewEntity = null; },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const tol = 8 / state.view.zoom;

    if (this._phase === 0) {
      const found = state.entities.slice().reverse().find(en => {
        const l = state.layers.find(x => x.id === en.layerId);
        if (!l || !l.visible || l.locked) return false;
        if (en.type === 'circle') return Math.abs(dist({ x: en.cx, y: en.cy }, pt) - en.r) < tol;
        if (en.type === 'arc') return Math.abs(dist({ x: en.cx, y: en.cy }, pt) - en.r) < tol;
        return false;
      });
      if (!found) { log('DimRadius: click on a circle or arc edge'); return; }
      this._cx = found.cx; this._cy = found.cy; this._r = found.r;
      this._phase = 1;
      log('DimRadius: click to place');
    } else {
      const angle = Math.atan2(pt.y - this._cy, pt.x - this._cx);
      pushHistory();
      state.entities.push({
        ...makeEntityBase('dim'),
        dimType: 'radius',
        cx: this._cx, cy: this._cy, r: this._r, angle,
        textOverride: null,
      });
      log('DimRadius: placed');
      this.deactivate(); render();
    }
  },

  onMouseMove(e, world, snap) {
    if (this._phase < 1) return;
    const pt = resolvePoint(world, snap);
    const angle = Math.atan2(pt.y - this._cy, pt.x - this._cx);
    state.previewEntity = {
      ...makeEntityBase('dim'), dimType: 'radius',
      cx: this._cx, cy: this._cy, r: this._r, angle, textOverride: null,
    };
    render();
  },

  onKeyDown(e) {
    if (e.key === 'Escape') { this.deactivate(); render(); e.preventDefault(); }
  },
};

export const dimDiameterTool = {
  _phase: 0, _cx: 0, _cy: 0, _r: 0,

  activate() {
    state.tool = 'DIMDIAMETER';
    this._phase = 0; state.previewEntity = null;
    log('DimDiameter: click on circle');
  },
  deactivate() { this._phase = 0; state.previewEntity = null; },

  onMouseDown(e, world, snap) {
    if (e.button !== 0) return;
    const pt = resolvePoint(world, snap);
    const tol = 8 / state.view.zoom;

    if (this._phase === 0) {
      const found = state.entities.slice().reverse().find(en => {
        const l = state.layers.find(x => x.id === en.layerId);
        if (!l || !l.visible || l.locked) return false;
        if (en.type === 'circle') return Math.abs(dist({ x: en.cx, y: en.cy }, pt) - en.r) < tol;
        return false;
      });
      if (!found) { log('DimDiameter: click on a circle edge'); return; }
      this._cx = found.cx; this._cy = found.cy; this._r = found.r;
      this._phase = 1;
      log('DimDiameter: click to set angle');
    } else {
      const angle = Math.atan2(pt.y - this._cy, pt.x - this._cx);
      pushHistory();
      state.entities.push({
        ...makeEntityBase('dim'),
        dimType: 'diameter',
        cx: this._cx, cy: this._cy, r: this._r, angle,
        textOverride: null,
      });
      log('DimDiameter: placed');
      this.deactivate(); render();
    }
  },

  onMouseMove(e, world, snap) {
    if (this._phase < 1) return;
    const pt = resolvePoint(world, snap);
    const angle = Math.atan2(pt.y - this._cy, pt.x - this._cx);
    state.previewEntity = {
      ...makeEntityBase('dim'), dimType: 'diameter',
      cx: this._cx, cy: this._cy, r: this._r, angle, textOverride: null,
    };
    render();
  },

  onKeyDown(e) {
    if (e.key === 'Escape') { this.deactivate(); render(); e.preventDefault(); }
  },
};

export const TOOLS = {
  SELECT: selectTool,
  LINE: lineTool,
  POLYLINE: polylineTool,
  RECT: rectTool,
  CIRCLE: circleTool,
  ARC: arcTool,
  TEXT: textTool,
  MOVE: moveTool,
  COPY: copyTool,
  OFFSET: offsetTool,
  TRIM: trimTool,
  EXTEND: extendTool,
  FILLET: filletTool,
  STRETCH: stretchTool,
  ARRAY: arrayTool,
  HATCH: hatchTool,
  DIMLINEAR: dimLinearTool,
  DIMALIGNED: dimAlignedTool,
  DIMRADIUS: dimRadiusTool,
  DIMDIAMETER: dimDiameterTool,
};

export function activateTool(toolName) {
  const prev = TOOLS[state.tool];
  if (prev && prev.deactivate) prev.deactivate();

  const tool = TOOLS[toolName];
  if (!tool) return;

  state.tool = toolName;
  tool.activate();

  // 選択中ツールのボタン状態を同期する。
  document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === toolName);
  });

  // ツール種別に応じたカーソルクラスへ切り替える。
  const container = document.getElementById('canvas-container');
  const cursorMap = {
    SELECT: 'select-mode',
    MOVE: 'move-mode',
    COPY: 'move-mode',
    TEXT: 'text-mode',
  };
  container.className = container.className
    .replace(/\b(select-mode|move-mode|text-mode)\b/g, '').trim();
  const cur = cursorMap[toolName];
  if (cur) container.classList.add(cur);
}
