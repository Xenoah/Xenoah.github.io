/* レイヤー・プロパティ・ステータス・コマンド履歴をstateから再描画する。
 * 図面変更を伴うUI操作は、render呼出しに加えてpushHistoryも行う。 */

import { state, pushHistory, canUndo, canRedo } from './core.js';
import { render } from './render.js';

// コマンド履歴はDOM増加を抑えるため直近80行だけ保持する。

const MAX_CMD_LINES = 80;

export function log(msg) {
  const history = document.getElementById('cmd-history');
  if (!history) return;

  const div = document.createElement('div');
  div.textContent = msg;
  div.style.whiteSpace = 'nowrap';
  history.appendChild(div);

  while (history.children.length > MAX_CMD_LINES) {
    history.removeChild(history.firstChild);
  }
  history.scrollTop = history.scrollHeight;
}

export function logError(msg) {
  const history = document.getElementById('cmd-history');
  if (!history) return;
  const div = document.createElement('div');
  div.textContent = '! ' + msg;
  div.style.color = '#f87171';
  history.appendChild(div);
  history.scrollTop = history.scrollHeight;
}

// ステータスバーはスナップ後の座標を優先し、確定される点を事前表示する。

export function updateStatusBar() {
  const coordEl = document.getElementById('status-coords');
  const itemsEl = document.getElementById('status-items');
  const zoomEl = document.getElementById('status-zoom');
  const toolEl = document.getElementById('status-tool');
  const orthoEl = document.getElementById('status-ortho');
  const snapEl = document.getElementById('status-snap');
  const selEl = document.getElementById('status-selected');

  if (coordEl) {
    const sp = state.snapPoint;
    const p = sp ? sp.world : state.mouseWorld;
    coordEl.textContent = `X: ${p.x.toFixed(3)}  Y: ${p.y.toFixed(3)}`;
  }
  if (itemsEl) itemsEl.textContent = `${state.entities.length} item${state.entities.length !== 1 ? 's' : ''}`;
  if (zoomEl) zoomEl.textContent = `${(state.view.zoom * 100).toFixed(0)}%`;
  if (toolEl) toolEl.textContent = state.tool;
  if (orthoEl) {
    orthoEl.textContent = state.orthoEnabled ? 'ORTHO:ON' : 'ORTHO:OFF';
    orthoEl.style.color = state.orthoEnabled ? '#4ade80' : '#484f58';
  }
  if (snapEl) {
    snapEl.textContent = state.snapEnabled ? 'SNAP:ON' : 'SNAP:OFF';
    snapEl.style.color = state.snapEnabled ? '#58a6ff' : '#484f58';
  }
  if (selEl) {
    if (state.selectedIds.size > 0) {
      selEl.textContent = `${state.selectedIds.size} selected`;
      selEl.classList.remove('hidden');
    } else {
      selEl.classList.add('hidden');
    }
  }

  // 履歴位置に応じてUndo/Redoの実行可否を同期する。
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  if (undoBtn) undoBtn.disabled = !canUndo();
  if (redoBtn) redoBtn.disabled = !canRedo();
}

// レイヤー行は選択・表示・ロック・名称変更を同じstate項目へ反映する。

let _colorPickerCallback = null;
let _colorPickerLayerId = null;

export function renderLayerPanel() {
  const container = document.getElementById('layers-list');
  if (!container) return;
  container.innerHTML = '';

  for (const layer of state.layers) {
    const isActive = layer.id === state.activeLayerId;
    const row = document.createElement('div');
    row.className = `layer-row flex items-center gap-1.5 px-2 py-1.5 cursor-pointer text-xs select-none ${isActive ? 'active-layer' : ''}`;
    row.title = `Click to set active layer: ${layer.name}`;

    // 色はレイヤー継承図形にも影響するため、変更後に図面全体を再描画する。
    const swatch = document.createElement('div');
    swatch.className = 'w-3.5 h-3.5 rounded-sm border border-black/30 shrink-0 cursor-pointer hover:ring-1 hover:ring-cad-accent';
    swatch.style.backgroundColor = layer.color;
    swatch.title = 'Click to change layer color';
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      openColorPicker(layer.id, layer.color);
    });

    // レイヤー名はDXFのレイヤー名としても出力される。
    const name = document.createElement('span');
    name.className = 'flex-1 truncate font-mono text-[11px]';
    name.style.color = layer.visible ? layer.color : '#484f58';
    name.textContent = layer.name;
    name.title = 'Double-click to rename';
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRenameLayer(layer.id, name);
    });

    // 非表示レイヤーは描画・スナップ候補から除外する。
    const visBtn = document.createElement('button');
    visBtn.className = 'shrink-0 opacity-60 hover:opacity-100 transition-opacity';
    visBtn.title = layer.visible ? 'Hide layer' : 'Show layer';
    visBtn.innerHTML = layer.visible
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
    visBtn.style.color = layer.visible ? '#c9d1d9' : '#484f58';
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.visible = !layer.visible;
      renderLayerPanel();
      render();
    });

    // ロック中レイヤーの図形は選択・編集対象から除外する。
    const lockBtn = document.createElement('button');
    lockBtn.className = 'shrink-0 opacity-60 hover:opacity-100 transition-opacity';
    lockBtn.title = layer.locked ? 'Unlock layer' : 'Lock layer';
    lockBtn.innerHTML = layer.locked
      ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
      : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
    lockBtn.style.color = layer.locked ? '#f0b429' : '#484f58';
    lockBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      layer.locked = !layer.locked;
      renderLayerPanel();
    });

    // 既定レイヤーは削除不可とし、図面の退避先を常に確保する。
    if (layer.id !== 'layer0') {
      const delBtn = document.createElement('button');
      delBtn.className = 'shrink-0 text-red-700 hover:text-red-400 opacity-50 hover:opacity-100 transition-opacity';
      delBtn.title = 'Delete layer';
      delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteLayer(layer.id);
      });
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(visBtn);
      row.appendChild(lockBtn);
      row.appendChild(delBtn);
    } else {
      row.appendChild(swatch);
      row.appendChild(name);
      row.appendChild(visBtn);
      row.appendChild(lockBtn);
    }

    row.addEventListener('click', () => {
      state.activeLayerId = layer.id;
      renderLayerPanel();
    });

    container.appendChild(row);
  }
}

function startRenameLayer(layerId, nameEl) {
  const layer = state.layers.find(l => l.id === layerId);
  if (!layer) return;

  const input = document.createElement('input');
  input.value = layer.name;
  input.className = 'prop-input flex-1 min-w-0';
  input.style.color = layer.color;

  const finish = () => {
    const val = input.value.trim();
    if (val) layer.name = val;
    renderLayerPanel();
  };

  input.addEventListener('blur', finish);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { finish(); e.preventDefault(); }
    if (e.key === 'Escape') { renderLayerPanel(); e.preventDefault(); }
    e.stopPropagation();
  });

  nameEl.replaceWith(input);
  input.select();
}

function deleteLayer(layerId) {
  // 削除レイヤー上の図形は失わず、既定レイヤーへ移動する。
  for (const ent of state.entities) {
    if (ent.layerId === layerId) ent.layerId = 'layer0';
  }
  state.layers = state.layers.filter(l => l.id !== layerId);
  if (state.activeLayerId === layerId) state.activeLayerId = 'layer0';
  renderLayerPanel();
  render();
}

// レイヤー色と図形個別色で共有するカラーピッカー。

const PRESET_COLORS = [
  '#ffffff', '#c9d1d9', '#8b949e', '#484f58', '#30363d', '#161b22',
  '#f87171', '#fb923c', '#fbbf24', '#a3e635', '#4ade80', '#34d399',
  '#22d3ee', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#e879f9',
  '#f472b6', '#fb7185', '#ff6b6b', '#ffd166', '#06d6a0', '#118ab2',
];

function openColorPicker(layerId, currentColor) {
  _colorPickerLayerId = layerId;
  const dialog = document.getElementById('color-picker-dialog');
  const swatches = document.getElementById('color-swatches');
  const customInput = document.getElementById('custom-color-input');
  const customHex = document.getElementById('custom-color-hex');

  swatches.innerHTML = '';
  for (const color of PRESET_COLORS) {
    const s = document.createElement('div');
    s.className = 'w-7 h-7 rounded cursor-pointer border-2 hover:scale-110 transition-transform';
    s.style.backgroundColor = color;
    s.style.borderColor = color === currentColor ? '#58a6ff' : 'transparent';
    s.title = color;
    s.addEventListener('click', () => {
      swatches.querySelectorAll('div').forEach(x => x.style.borderColor = 'transparent');
      s.style.borderColor = '#58a6ff';
      customInput.value = color;
      customHex.textContent = color;
    });
    swatches.appendChild(s);
  }

  customInput.value = currentColor;
  customHex.textContent = currentColor;
  customInput.addEventListener('input', () => {
    customHex.textContent = customInput.value;
  });

  dialog.classList.remove('hidden');
}

export function initColorPicker() {
  const dialog = document.getElementById('color-picker-dialog');
  const customInput = document.getElementById('custom-color-input');

  document.getElementById('color-ok').addEventListener('click', () => {
    const color = customInput.value;
    if (_colorPickerLayerId) {
      const layer = state.layers.find(l => l.id === _colorPickerLayerId);
      if (layer) layer.color = color;
    }
    dialog.classList.add('hidden');
    renderLayerPanel();
    render();
  });

  document.getElementById('color-cancel').addEventListener('click', () => {
    dialog.classList.add('hidden');
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.classList.add('hidden');
  });
}

// 単一選択時は図形固有値、複数選択時は共通変更可能な項目だけを表示する。

export function renderPropertiesPanel() {
  const panel = document.getElementById('properties-panel');
  if (!panel) return;

  if (state.selectedIds.size === 0) {
    panel.innerHTML = '<div class="text-gray-500 italic text-center mt-6 text-xs">No selection</div>';
    return;
  }

  if (state.selectedIds.size > 1) {
    panel.innerHTML = `<div class="text-gray-400 text-xs text-center mt-4">${state.selectedIds.size} items selected</div>`;
    return;
  }

  const id = [...state.selectedIds][0];
  const ent = state.entities.find(e => e.id === id);
  if (!ent) return;

  const layer = state.layers.find(l => l.id === ent.layerId);
  panel.innerHTML = '';

  const rows = [];

  rows.push(['Type', ent.type.toUpperCase(), false]);

  // レイヤー変更は選択図形すべてへ適用する。
  const layerSelect = document.createElement('select');
  layerSelect.className = 'prop-input';
  state.layers.forEach(l => {
    const opt = document.createElement('option');
    opt.value = l.id;
    opt.textContent = l.name;
    if (l.id === ent.layerId) opt.selected = true;
    layerSelect.appendChild(opt);
  });
  layerSelect.addEventListener('change', () => {
    pushHistory();
    ent.layerId = layerSelect.value;
    render();
  });

  // 図形種別ごとに編集可能な座標・寸法を追加する。
  switch (ent.type) {
    case 'line':
      rows.push(['Start X', ent.start.x.toFixed(3), true, v => { pushHistory(); ent.start.x = parseFloat(v); render(); }]);
      rows.push(['Start Y', ent.start.y.toFixed(3), true, v => { pushHistory(); ent.start.y = parseFloat(v); render(); }]);
      rows.push(['End X', ent.end.x.toFixed(3), true, v => { pushHistory(); ent.end.x = parseFloat(v); render(); }]);
      rows.push(['End Y', ent.end.y.toFixed(3), true, v => { pushHistory(); ent.end.y = parseFloat(v); render(); }]);
      rows.push(['Length', dist(ent.start, ent.end).toFixed(3), false]);
      break;
    case 'circle':
      rows.push(['Center X', ent.cx.toFixed(3), true, v => { pushHistory(); ent.cx = parseFloat(v); render(); }]);
      rows.push(['Center Y', ent.cy.toFixed(3), true, v => { pushHistory(); ent.cy = parseFloat(v); render(); }]);
      rows.push(['Radius', ent.r.toFixed(3), true, v => { pushHistory(); ent.r = Math.abs(parseFloat(v)); render(); }]);
      rows.push(['Diameter', (ent.r * 2).toFixed(3), false]);
      rows.push(['Circumf.', (2 * Math.PI * ent.r).toFixed(3), false]);
      rows.push(['Area', (Math.PI * ent.r * ent.r).toFixed(3), false]);
      break;
    case 'arc':
      rows.push(['Center X', ent.cx.toFixed(3), true, v => { pushHistory(); ent.cx = parseFloat(v); render(); }]);
      rows.push(['Center Y', ent.cy.toFixed(3), true, v => { pushHistory(); ent.cy = parseFloat(v); render(); }]);
      rows.push(['Radius', ent.r.toFixed(3), true, v => { pushHistory(); ent.r = Math.abs(parseFloat(v)); render(); }]);
      rows.push(['Start °', (ent.startAngle * 180 / Math.PI).toFixed(2), true, v => { pushHistory(); ent.startAngle = parseFloat(v) * Math.PI / 180; render(); }]);
      rows.push(['End °',   (ent.endAngle   * 180 / Math.PI).toFixed(2), true, v => { pushHistory(); ent.endAngle   = parseFloat(v) * Math.PI / 180; render(); }]);
      break;
    case 'rect':
      rows.push(['X', ent.x.toFixed(3), true, v => { pushHistory(); ent.x = parseFloat(v); render(); }]);
      rows.push(['Y', ent.y.toFixed(3), true, v => { pushHistory(); ent.y = parseFloat(v); render(); }]);
      rows.push(['Width', Math.abs(ent.width).toFixed(3), true, v => { pushHistory(); ent.width = parseFloat(v); render(); }]);
      rows.push(['Height', Math.abs(ent.height).toFixed(3), true, v => { pushHistory(); ent.height = parseFloat(v); render(); }]);
      rows.push(['Area', (Math.abs(ent.width) * Math.abs(ent.height)).toFixed(3), false]);
      break;
    case 'polyline':
      rows.push(['Pts', ent.points.length, false]);
      rows.push(['Closed', ent.closed ? 'Yes' : 'No', false]);
      break;
    case 'text':
      rows.push(['Text', ent.text, true, v => { pushHistory(); ent.text = v; render(); }]);
      rows.push(['X', ent.x.toFixed(3), true, v => { pushHistory(); ent.x = parseFloat(v); render(); }]);
      rows.push(['Y', ent.y.toFixed(3), true, v => { pushHistory(); ent.y = parseFloat(v); render(); }]);
      rows.push(['Font Size', ent.fontSize, true, v => { pushHistory(); ent.fontSize = parseFloat(v); render(); }]);
      break;
    case 'dim':
      rows.push(['Dim Type', ent.dimType, false]);
      if (ent.p1) {
        rows.push(['P1 X', ent.p1.x.toFixed(3), true, v => { pushHistory(); ent.p1.x = parseFloat(v); render(); }]);
        rows.push(['P1 Y', ent.p1.y.toFixed(3), true, v => { pushHistory(); ent.p1.y = parseFloat(v); render(); }]);
        rows.push(['P2 X', ent.p2.x.toFixed(3), true, v => { pushHistory(); ent.p2.x = parseFloat(v); render(); }]);
        rows.push(['P2 Y', ent.p2.y.toFixed(3), true, v => { pushHistory(); ent.p2.y = parseFloat(v); render(); }]);
        let measured;
        if (ent.dimType === 'linear_h') measured = Math.abs(ent.p2.x - ent.p1.x).toFixed(3);
        else if (ent.dimType === 'linear_v') measured = Math.abs(ent.p2.y - ent.p1.y).toFixed(3);
        else measured = Math.hypot(ent.p2.x - ent.p1.x, ent.p2.y - ent.p1.y).toFixed(3);
        rows.push(['Measured', measured, false]);
      } else {
        rows.push(['Center X', ent.cx.toFixed(3), true, v => { pushHistory(); ent.cx = parseFloat(v); render(); }]);
        rows.push(['Center Y', ent.cy.toFixed(3), true, v => { pushHistory(); ent.cy = parseFloat(v); render(); }]);
        rows.push(['Radius', ent.r.toFixed(3), false]);
      }
      rows.push(['Text', ent.textOverride || '', true, v => { pushHistory(); ent.textOverride = v || null; render(); }]);
      break;
  }

  for (const [label, value, editable, onChange] of rows) {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const lbl = document.createElement('div');
    lbl.className = 'prop-label';
    lbl.textContent = label;
    row.appendChild(lbl);

    if (editable && onChange) {
      const inp = document.createElement('input');
      inp.className = 'prop-input';
      inp.value = value;
      inp.addEventListener('change', () => onChange(inp.value));
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter') inp.blur();
        e.stopPropagation();
      });
      row.appendChild(inp);
    } else {
      const val = document.createElement('div');
      val.className = 'prop-value text-right';
      val.textContent = value;
      row.appendChild(val);
    }

    panel.appendChild(row);
  }

  // ポリラインだけは各頂点を個別編集できる一覧を追加する。
  if (ent.type === 'polyline') {
    const hdr = document.createElement('div');
    hdr.className = 'text-[9px] text-gray-500 uppercase tracking-wider mt-2 mb-1 border-b border-cad-border pb-0.5';
    hdr.textContent = `Vertices (${ent.points.length})`;
    panel.appendChild(hdr);

    ent.points.forEach((pt, idx) => {
      const vrow = document.createElement('div');
      vrow.style.cssText = 'display:grid;grid-template-columns:28px 1fr 1fr;gap:3px;align-items:center;margin-bottom:2px';

      const lbl = document.createElement('div');
      lbl.className = 'prop-label';
      lbl.textContent = `P${idx + 1}`;

      const makeInp = (axis) => {
        const inp = document.createElement('input');
        inp.className = 'prop-input';
        inp.value = pt[axis].toFixed(3);
        inp.title = `P${idx + 1} ${axis.toUpperCase()}`;
        inp.placeholder = axis.toUpperCase();
        inp.addEventListener('change', () => {
          const n = parseFloat(inp.value);
          if (isNaN(n)) return;
          pushHistory();
          pt[axis] = n;
          render();
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); e.stopPropagation(); });
        return inp;
      };

      vrow.appendChild(lbl);
      vrow.appendChild(makeInp('x'));
      vrow.appendChild(makeInp('y'));
      panel.appendChild(vrow);
    });
  }

  const layerRow = document.createElement('div');
  layerRow.className = 'prop-row mt-1';
  const lbl = document.createElement('div');
  lbl.className = 'prop-label';
  lbl.textContent = 'Layer';
  layerRow.appendChild(lbl);
  layerRow.appendChild(layerSelect);
  panel.appendChild(layerRow);

  const ltRow = document.createElement('div');
  ltRow.className = 'prop-row';
  const ltLbl = document.createElement('div');
  ltLbl.className = 'prop-label';
  ltLbl.textContent = 'Line Type';
  const ltSel = document.createElement('select');
  ltSel.className = 'prop-input';
  ['solid', 'dashed', 'dotted', 'center', 'phantom'].forEach(lt => {
    const opt = document.createElement('option');
    opt.value = lt;
    opt.textContent = lt === 'solid' ? 'Solid (ByLayer)' : lt.charAt(0).toUpperCase() + lt.slice(1);
    if ((ent.lineType || 'solid') === lt) opt.selected = true;
    ltSel.appendChild(opt);
  });
  ltSel.addEventListener('change', () => {
    pushHistory();
    ent.lineType = ltSel.value === 'solid' ? null : ltSel.value;
    render();
  });
  ltRow.appendChild(ltLbl);
  ltRow.appendChild(ltSel);
  panel.appendChild(ltRow);
}

// 新規レイヤーは既存名称と衝突しないIDを発行して追加する。

let _layerCounter = 4;

export function createNewLayer() {
  const colors = ['#a78bfa', '#34d399', '#fb923c', '#38bdf8', '#f472b6', '#4ade80'];
  const id = `layer${Date.now()}`;
  const color = colors[_layerCounter % colors.length];
  state.layers.push({
    id,
    name: `Layer ${_layerCounter++}`,
    color,
    visible: true,
    locked: false,
    lineType: 'solid',
    lineWeight: 0.25,
  });
  state.activeLayerId = id;
  renderLayerPanel();
}

// プロパティ表示用の簡易距離計算。
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
