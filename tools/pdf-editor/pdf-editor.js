/* PDF.jsで表示・解析し、pdf-libでページ編集と保存を行う。
 * pdf-libはHTMLからグローバル読込、PDF.jsはES moduleとして読み込む。 */

import * as pdfjsLib from './lib/pdf.min.mjs';

// 本体とWorkerの版ずれを避けるため、同梱したPDF.js Workerを必ず使う。
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.min.mjs', import.meta.url).href;

// ページ順序・注釈・表示・保存設定を共有する単一状態。

const S = {
  pdfDoc:      null,   // PDFDocumentProxy（元PDFのみ）
  originalPdfDoc: null, // Before表示用に保持する未編集のPDFDocumentProxy
  pdfBytes:    null,   // Uint8Array
  fileName:    '',
  totalPages:  0,      // 論理ページ数 = pageOrder.length
  pageOrder:   [],     // 論理ページIDの配列（数値=元PDF index, 文字列=blank/dup/imported）
  pageSources: {},     // { [pageId]: { kind, origin, sourceKey, sourceIndex, width, height } }
  importedPdfs: {},    // { [sourceKey]: { bytes, fileName } } 結合元PDFのバイト
  pageRotations: {},  // { [pageId]: additional clockwise degrees }
  pageDims:    {},     // { [pageId]: {width, height} }
  textItems:   {},     // { [pageId]: Text edit hit targets }
  currentPage: 0,      // 現在の論理ページID
  zoom:        1.25,
  viewMode:    'continuous', // 'single' | 'continuous'
  annotations: [],
  selectedIds: [],     // サムネで複数選択中の論理ページID配列
  selectionAnchor: null, // 範囲選択用のアンカー（pageId）
  selectedId:  null,
  selectedAnnIds: [],  // 複数選択中の注釈ID
  clipboard: [],       // 注釈専用の内部クリップボード
  activeTool:  'select',
  fitMode:     null, // 'page' | 'width'
  pageIdCounter: 0,
  // Before / After 比較
  compareMode: 'off',  // 'off' | 'before' | 'split'
  compareDiff: false,  // 差分ハイライトの ON/OFF
  compareTempActive: false, // 長押し中のBefore表示中フラグ
  toolOptions: {
    color:      '#e53e3e',
    fillColor:  null,
    strokeWidth: 2,
    opacity:    1.0,
    fontSize:   14,
    fontColor:  '#1a202c',
    editBgColor: '#ffffff',
  },
  // 全ページに適用する装飾設定
  watermarkConfig: { enabled: false, text: '', fontSize: 80, color: '#e53e3e', opacity: 0.2, angle: -30, placement: 'center', scope: 'all', appliedToPageId: null },
  pageNumberConfig: { enabled: false, format: '{n}/{total}', customFormat: '', position: 'bc', fontSize: 11, color: '#1a202c', start: 1, fromPage: 1, offsetX: 0, offsetY: 0 },
  headerFooterConfig: {
    header: { enabled: false, text: '', align: 'center', fontSize: 11, color: '#1a202c' },
    footer: { enabled: false, text: '', align: 'center', fontSize: 11, color: '#1a202c' },
  },
  history:     [createSnapshot([], [], {}, {}, {})],
  histIdx:     0,
  dirty:       false,  // 未保存変更フラグ
  // PDF内検索
  searchOpen:        false,
  searchQuery:       '',
  searchCaseSensitive: false,
  searchIndex:       null,   // { [pageId]: [{ text, rect }] } 全ページのテキストアイテム索引
  searchIndexBuilding: false,
  searchResults:     [],     // [{ pageId, itemIndex, rect }]
  searchActiveIndex: -1,     // searchResults 内のアクティブインデックス
  // 保存方式・書き出し設定
  saveSettings: {
    mode: 'standard',                   // 'standard' | 'flatten' | 'project'
    filenameTemplate: '{original}_edited',
    metadata: {
      title: '',
      author: '',
      subject: '',
      keywords: [],
      producer: '',
      creator: '',
    },
    metadataUserEdited: {               // PDF再読込時に上書きしない項目を記録
      title: false, author: false, subject: false,
      keywords: false, producer: false, creator: false,
    },
  },
};

function nextPageId(prefix) {
  S.pageIdCounter += 1;
  return `${prefix}-${S.pageIdCounter}`;
}

// 履歴には表示状態を含めず、保存結果へ影響する編集内容だけを保持する。

function createSnapshot(annotations, pageOrder, pageRotations, pageSources, pageDims) {
  return {
    annotations: annotations.map((a) => ({ ...a })),
    pageOrder:   pageOrder.slice(),
    pageRotations: { ...pageRotations },
    pageSources: cloneSources(pageSources || {}),
    pageDims:    clonePageDims(pageDims || {}),
    // 全ページ装飾もUndo対象なので、注釈・ページ順序と同じスナップショットへ含める。
    watermarkConfig: typeof S !== 'undefined' && S.watermarkConfig ? { ...S.watermarkConfig } : null,
    pageNumberConfig: typeof S !== 'undefined' && S.pageNumberConfig ? { ...S.pageNumberConfig } : null,
    headerFooterConfig: typeof S !== 'undefined' && S.headerFooterConfig
      ? { header: { ...S.headerFooterConfig.header }, footer: { ...S.headerFooterConfig.footer } }
      : null,
  };
}

function cloneSources(sources) {
  const out = {};
  for (const k of Object.keys(sources)) out[k] = { ...sources[k] };
  return out;
}

function clonePageDims(dims) {
  const out = {};
  for (const k of Object.keys(dims)) out[k] = { ...dims[k] };
  return out;
}

function pushHistory() {
  S.history = S.history.slice(0, S.histIdx + 1);
  S.history.push(createSnapshot(S.annotations, S.pageOrder, S.pageRotations, S.pageSources, S.pageDims));
  if (S.history.length > 50) {
    S.history.shift();
    if (typeof S.savedHistIdx === 'number') S.savedHistIdx -= 1;
  }
  S.histIdx = S.history.length - 1;
  setDirty(true);
}

function applySnapshot(snap) {
  S.annotations = snap.annotations.map((a) => ({ ...a }));
  S.pageOrder = snap.pageOrder.slice();
  S.pageRotations = { ...snap.pageRotations };
  if (snap.pageSources) S.pageSources = cloneSources(snap.pageSources);
  if (snap.pageDims) S.pageDims = clonePageDims(snap.pageDims);
  // 全ページ装飾も注釈と同時点の状態へ戻す。
  if (snap.watermarkConfig) S.watermarkConfig = { ...snap.watermarkConfig };
  if (snap.pageNumberConfig) S.pageNumberConfig = { ...snap.pageNumberConfig };
  if (snap.headerFooterConfig) {
    S.headerFooterConfig = {
      header: { ...snap.headerFooterConfig.header },
      footer: { ...snap.headerFooterConfig.footer },
    };
  }
  S.totalPages = S.pageOrder.length;
  if (!S.pageOrder.includes(S.currentPage)) {
    S.currentPage = S.pageOrder[0] ?? 0;
  }
  S.selectedId = null;
  S.selectedAnnIds = [];
  S.selectedIds = [];
  S.selectionAnchor = null;
}

// 注釈の複数選択管理
function setSelectedAnnIds(ids) {
  S.selectedAnnIds = Array.isArray(ids) ? ids.filter((id) => S.annotations.some((a) => a.id === id)) : [];
  S.selectedId = S.selectedAnnIds[S.selectedAnnIds.length - 1] || null;
}

function isAnnSelected(id) {
  return S.selectedAnnIds.includes(id) || id === S.selectedId;
}

function getSelectedAnnotations() {
  const ids = S.selectedAnnIds.length ? S.selectedAnnIds : (S.selectedId ? [S.selectedId] : []);
  return S.annotations.filter((a) => ids.includes(a.id));
}

function undo() {
  if (S.histIdx <= 0) return;
  S.histIdx--;
  applySnapshot(S.history[S.histIdx]);
  refreshPageStructure();
  renderAnnotationsAll();
  updateUndoRedo();
  updateOptionsPanel();
  updatePageEditButtons();
  setDirty(S.histIdx !== S.savedHistIdx);
}

function redo() {
  if (S.histIdx >= S.history.length - 1) return;
  S.histIdx++;
  applySnapshot(S.history[S.histIdx]);
  refreshPageStructure();
  renderAnnotationsAll();
  updateUndoRedo();
  updateOptionsPanel();
  updatePageEditButtons();
  setDirty(S.histIdx !== S.savedHistIdx);
}

function addAnnotation(ann) {
  S.annotations = [...S.annotations, ann];
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
}

function updateAnnotation(id, changes) {
  S.annotations = S.annotations.map((a) => a.id === id ? { ...a, ...changes } : a);
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
}

function deleteAnnotation(id) {
  S.annotations = S.annotations.filter((a) => a.id !== id);
  S.selectedId = null;
  S.selectedAnnIds = S.selectedAnnIds.filter((x) => x !== id);
  S.selectedIds = [];
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
  updateOptionsPanel();
}

// 複数注釈の削除
function deleteAnnotations(ids) {
  const set = new Set(ids);
  if (!set.size) return;
  S.annotations = S.annotations.filter((a) => !set.has(a.id));
  S.selectedAnnIds = [];
  S.selectedId = null;
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
  updateOptionsPanel();
}

// 貼り付け結果が元注釈と重ならないよう、一定量ずらして複製する。
function copySelectedAnnotations() {
  const sel = getSelectedAnnotations();
  if (!sel.length) return false;
  S.clipboard = sel.map((a) => cloneAnnotation(a));
  showToast(`${sel.length}件の注釈をコピーしました`, 'info', 1600);
  return true;
}

function pasteAnnotations() {
  if (!S.clipboard.length) return;
  const offset = 10 / S.zoom; // 画面上で約10pxずらす
  const newIds = [];
  const newAnns = S.clipboard.map((a) => {
    const c = cloneAnnotation(a);
    c.id = genId();
    c.pageIndex = S.currentPage;
    c.rect = { ...c.rect, x: c.rect.x + offset, y: c.rect.y - offset };
    if (c.startPoint) c.startPoint = { x: c.startPoint.x + offset, y: c.startPoint.y - offset };
    if (c.endPoint) c.endPoint = { x: c.endPoint.x + offset, y: c.endPoint.y - offset };
    if (c.inkLists) {
      c.inkLists = c.inkLists.map((stroke) => stroke.map((p) => ({ x: p.x + offset, y: p.y - offset })));
    }
    // textedit はソース参照が変わるので freetext へ降格
    if (c.type === 'textedit') {
      c.type = 'freetext';
      delete c.sourceId;
      delete c.originalText;
    }
    newIds.push(c.id);
    return c;
  });
  S.annotations = [...S.annotations, ...newAnns];
  setSelectedAnnIds(newIds);
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
  updateOptionsPanel();
  showToast(`${newAnns.length}件の注釈を貼り付けました`, 'success', 1600);
}

function cloneAnnotation(a) {
  const c = { ...a };
  if (c.rect) c.rect = { ...c.rect };
  if (c.startPoint) c.startPoint = { ...c.startPoint };
  if (c.endPoint) c.endPoint = { ...c.endPoint };
  if (c.inkLists) c.inkLists = c.inkLists.map((stroke) => stroke.map((p) => ({ ...p })));
  // 画像系注釈のsrc/textは浅いコピーで共有しても不変値として扱える。
  return c;
}

// 配列順がSVGの描画順になるため、前面・背面操作は配列を並べ替える。
function reorderSelectedAnnotations(direction) {
  const ids = (S.selectedAnnIds.length ? S.selectedAnnIds : (S.selectedId ? [S.selectedId] : []));
  if (!ids.length) return;
  const idSet = new Set(ids);
  const all = S.annotations.slice();
  const selected = all.filter((a) => idSet.has(a.id));
  const others = all.filter((a) => !idSet.has(a.id));

  if (direction === 'front') {
    S.annotations = [...others, ...selected];
  } else if (direction === 'back') {
    S.annotations = [...selected, ...others];
  } else if (direction === 'forward' || direction === 'backward') {
    const next = all.slice();
    const delta = direction === 'forward' ? 1 : -1;
    // 順序保持のために走査する
    const sortedIdx = ids
      .map((id) => next.findIndex((a) => a.id === id))
      .filter((i) => i !== -1)
      .sort((x, y) => direction === 'forward' ? y - x : x - y);
    for (const i of sortedIdx) {
      const j = i + delta;
      if (j < 0 || j >= next.length) continue;
      if (idSet.has(next[j].id)) continue; // 隣も選択中ならスキップ
      [next[i], next[j]] = [next[j], next[i]];
    }
    S.annotations = next;
  }
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
}

// 複数注釈の整列
function alignSelectedAnnotations(mode) {
  const sel = getSelectedAnnotations();
  if (sel.length < 2) return;
  // PDF座標: y は下が小さい → 視覚的に top = y + height
  const lefts = sel.map((a) => a.rect.x);
  const rights = sel.map((a) => a.rect.x + a.rect.width);
  const bottoms = sel.map((a) => a.rect.y);
  const tops = sel.map((a) => a.rect.y + a.rect.height);
  const minX = Math.min(...lefts);
  const maxX = Math.max(...rights);
  const minY = Math.min(...bottoms);
  const maxY = Math.max(...tops);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const updates = new Map();
  for (const a of sel) {
    let dx = 0, dy = 0;
    switch (mode) {
      case 'left':    dx = minX - a.rect.x; break;
      case 'right':   dx = maxX - (a.rect.x + a.rect.width); break;
      case 'hcenter': dx = cx - (a.rect.x + a.rect.width / 2); break;
      // 視覚的な top = y + height (PDF座標)
      case 'top':     dy = maxY - (a.rect.y + a.rect.height); break;
      case 'bottom':  dy = minY - a.rect.y; break;
      case 'vcenter': dy = cy - (a.rect.y + a.rect.height / 2); break;
    }
    if (dx !== 0 || dy !== 0) updates.set(a.id, { dx, dy });
  }

  if (mode === 'hdistribute' || mode === 'vdistribute') {
    distributeSelected(sel, mode);
  } else if (updates.size) {
    S.annotations = S.annotations.map((a) => {
      const u = updates.get(a.id);
      if (!u) return a;
      const next = { ...a, rect: { ...a.rect, x: a.rect.x + u.dx, y: a.rect.y + u.dy } };
      if (next.startPoint) next.startPoint = { x: next.startPoint.x + u.dx, y: next.startPoint.y + u.dy };
      if (next.endPoint) next.endPoint = { x: next.endPoint.x + u.dx, y: next.endPoint.y + u.dy };
      if (next.inkLists) next.inkLists = next.inkLists.map((stroke) => stroke.map((p) => ({ x: p.x + u.dx, y: p.y + u.dy })));
      return next;
    });
  }
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
}

function distributeSelected(sel, mode) {
  if (sel.length < 3) return;
  const sorted = sel.slice().sort((a, b) => {
    if (mode === 'hdistribute') return (a.rect.x + a.rect.width / 2) - (b.rect.x + b.rect.width / 2);
    return (a.rect.y + a.rect.height / 2) - (b.rect.y + b.rect.height / 2);
  });
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstCenter = mode === 'hdistribute'
    ? first.rect.x + first.rect.width / 2
    : first.rect.y + first.rect.height / 2;
  const lastCenter = mode === 'hdistribute'
    ? last.rect.x + last.rect.width / 2
    : last.rect.y + last.rect.height / 2;
  const span = lastCenter - firstCenter;
  const step = span / (sorted.length - 1);

  const updates = new Map();
  for (let i = 1; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const target = firstCenter + step * i;
    if (mode === 'hdistribute') {
      const cur = a.rect.x + a.rect.width / 2;
      updates.set(a.id, { dx: target - cur, dy: 0 });
    } else {
      const cur = a.rect.y + a.rect.height / 2;
      updates.set(a.id, { dx: 0, dy: target - cur });
    }
  }
  if (!updates.size) return;
  S.annotations = S.annotations.map((a) => {
    const u = updates.get(a.id);
    if (!u) return a;
    const next = { ...a, rect: { ...a.rect, x: a.rect.x + u.dx, y: a.rect.y + u.dy } };
    if (next.startPoint) next.startPoint = { x: next.startPoint.x + u.dx, y: next.startPoint.y + u.dy };
    if (next.endPoint) next.endPoint = { x: next.endPoint.x + u.dx, y: next.endPoint.y + u.dy };
    if (next.inkLists) next.inkLists = next.inkLists.map((stroke) => stroke.map((p) => ({ x: p.x + u.dx, y: p.y + u.dy })));
    return next;
  });
}

function genId() { return `a${Date.now()}${Math.random().toString(36).slice(2, 6)}`; }

// 論理ページIDを介し、元PDF・白紙・複製・結合ページを同じ順序配列で扱う。

function normalizeRotation(angle) {
  return ((angle % 360) + 360) % 360;
}

// dataset 経由のページIDを正規化（数値文字列は数値に戻す）
function parsePageId(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (/^-?\d+$/.test(raw)) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && S.pageOrder.includes(n)) return n;
  }
  if (S.pageOrder.includes(raw)) return raw;
  return null;
}

function getPageRotation(pageId) {
  return normalizeRotation(S.pageRotations[pageId] || 0);
}

function getPageOrderIndex(pageId) {
  const idx = S.pageOrder.indexOf(pageId);
  return idx === -1 ? 0 : idx;
}

function getCurrentOrderIndex() {
  return getPageOrderIndex(S.currentPage);
}

function getPageSource(pageId) {
  return S.pageSources[pageId] || { kind: 'source', sourceIndex: typeof pageId === 'number' ? pageId : 0 };
}

function getPageKind(pageId) {
  return getPageSource(pageId).kind;
}

function getVisualPageDims(pageId) {
  const dims = S.pageDims[pageId];
  if (!dims) return null;
  return getPageRotation(pageId) % 180 === 0
    ? { width: dims.width, height: dims.height }
    : { width: dims.height, height: dims.width };
}

// 白紙ページのデフォルトサイズ（A4 縦, ポイント単位）
const BLANK_PAGE_DEFAULTS = { width: 595.28, height: 841.89 };

function inferBlankPageDims() {
  // 直前ページ or 既存ページ平均
  const existing = Object.values(S.pageDims).filter((d) => d && d.width && d.height);
  if (S.pageOrder.length) {
    const lastId = S.pageOrder[S.pageOrder.length - 1];
    const d = S.pageDims[lastId];
    if (d && d.width && d.height) return { width: d.width, height: d.height };
  }
  if (existing.length) {
    const w = existing.reduce((a, b) => a + b.width, 0) / existing.length;
    const h = existing.reduce((a, b) => a + b.height, 0) / existing.length;
    return { width: w, height: h };
  }
  return { ...BLANK_PAGE_DEFAULTS };
}

function rotationSurfaceTransform(angle, w, h) {
  switch (normalizeRotation(angle)) {
    case 90:  return `translate(${h}px, 0) rotate(90deg)`;
    case 180: return `translate(${w}px, ${h}px) rotate(180deg)`;
    case 270: return `translate(0, ${w}px) rotate(270deg)`;
    default:  return 'none';
  }
}

function pageDataSelector(pageId) {
  const v = String(pageId).replace(/["\\]/g, (m) => `\\${m}`);
  return `[data-page="${v}"]`;
}

function goToOrderIndex(orderIndex, scroll = true) {
  if (!S.pageOrder.length) return;
  const next = Math.min(S.pageOrder.length - 1, Math.max(0, orderIndex));
  S.currentPage = S.pageOrder[next];
  updatePageNav();
  updateThumbActive();
  if (S.viewMode === 'single') {
    renderViewer();
  } else if (scroll) {
    const pw = document.querySelector(`.page-wrapper${pageDataSelector(S.currentPage)}`);
    if (pw) pw.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function refreshPageStructure(statusText = '') {
  renderThumbnails();
  renderViewer();
  updatePageNav();
  if (statusText) setStatus(statusText);
}

function rotatePage(pageId, delta) {
  if (!S.pdfDoc || pageId == null || S.pageOrder.indexOf(pageId) === -1) return;
  // 複数選択中ならまとめて回転
  const targets = (S.selectedIds.length > 1 && S.selectedIds.includes(pageId))
    ? S.selectedIds.slice()
    : [pageId];
  for (const id of targets) {
    S.pageRotations[id] = normalizeRotation(getPageRotation(id) + delta);
  }
  S.currentPage = pageId;
  pushHistory();
  refreshPageStructure(
    targets.length > 1
      ? `${targets.length}ページを${delta > 0 ? '右' : '左'}に回転しました`
      : (delta > 0 ? 'ページを右に回転しました' : 'ページを左に回転しました')
  );
  updateUndoRedo();
}

function movePageTo(pageId, targetIndex) {
  const from = S.pageOrder.indexOf(pageId);
  if (from === -1) return;
  const to = Math.min(S.pageOrder.length - 1, Math.max(0, targetIndex));
  if (from === to) return;
  const [moved] = S.pageOrder.splice(from, 1);
  S.pageOrder.splice(to, 0, moved);
  S.currentPage = moved;
  pushHistory();
  refreshPageStructure('ページを並べ替えました');
  updateUndoRedo();
}

function movePageNear(pageId, targetPageId, placeAfter) {
  // 複数ページ移動: drag 対象が selectedIds に含まれていればまとめて移動
  const moving = (S.selectedIds.length > 1 && S.selectedIds.includes(pageId))
    ? S.selectedIds.slice()
    : [pageId];
  const targetIdx = S.pageOrder.indexOf(targetPageId);
  if (targetIdx === -1) return;
  if (moving.includes(targetPageId)) return; // 自分自身の上に落としても何もしない
  // 元の並びを保持して取り出す
  const orderedMoving = S.pageOrder.filter((id) => moving.includes(id));
  if (!orderedMoving.length) return;
  for (const id of orderedMoving) {
    const idx = S.pageOrder.indexOf(id);
    if (idx !== -1) S.pageOrder.splice(idx, 1);
  }
  let insertAt = S.pageOrder.indexOf(targetPageId) + (placeAfter ? 1 : 0);
  insertAt = Math.min(S.pageOrder.length, Math.max(0, insertAt));
  S.pageOrder.splice(insertAt, 0, ...orderedMoving);
  S.currentPage = orderedMoving[0];
  S.selectedIds = orderedMoving.slice();
  S.selectionAnchor = orderedMoving[0];
  pushHistory();
  refreshPageStructure(orderedMoving.length > 1
    ? `${orderedMoving.length}ページを並べ替えました`
    : 'ページを並べ替えました');
  updateUndoRedo();
}

// ページ追加・削除・複製・結合

function deletePages(pageIds) {
  if (!S.pdfDoc) return;
  const ids = pageIds.filter((id) => S.pageOrder.includes(id));
  if (!ids.length) return;
  if (S.pageOrder.length - ids.length < 1) {
    showToast('全ページを削除することはできません', 'error');
    return;
  }
  const firstIdx = Math.min(...ids.map((id) => S.pageOrder.indexOf(id)));
  S.pageOrder = S.pageOrder.filter((id) => !ids.includes(id));
  for (const id of ids) {
    delete S.pageRotations[id];
    delete S.pageDims[id];
    delete S.pageSources[id];
    delete S.textItems[id];
  }
  S.annotations = S.annotations.filter((a) => !ids.includes(a.pageIndex));
  const nextIdx = Math.min(firstIdx, S.pageOrder.length - 1);
  S.currentPage = S.pageOrder[Math.max(0, nextIdx)];
  S.selectedIds = [];
  S.selectionAnchor = null;
  S.totalPages = S.pageOrder.length;
  pushHistory();
  refreshPageStructure(`${ids.length}ページを削除しました`);
  document.getElementById('page-total').textContent = `/ ${S.totalPages}`;
  updateUndoRedo();
  updatePageEditButtons();
  showToast(`${ids.length}ページを削除しました`, 'success');
}

function duplicatePages(pageIds) {
  if (!S.pdfDoc) return;
  const orderedIds = S.pageOrder.filter((id) => pageIds.includes(id));
  if (!orderedIds.length) return;
  // 最後の対象ページの後ろにまとめて挿入
  const lastIdx = S.pageOrder.indexOf(orderedIds[orderedIds.length - 1]);
  const newIds = [];
  for (const srcId of orderedIds) {
    const src = getPageSource(srcId);
    const newId = nextPageId('dup');
    // 複製は元PDFの sourceIndex を引き継ぐ（imported は importedKey も引き継ぐ）
    const newSource = { kind: 'duplicate', sourceIndex: src.sourceIndex };
    if (src.sourceKey) newSource.sourceKey = src.sourceKey;
    if (src.kind === 'blank') {
      newSource.kind = 'blank';
      newSource.width = src.width;
      newSource.height = src.height;
    }
    S.pageSources[newId] = newSource;
    // 寸法/回転も継承
    if (S.pageDims[srcId]) S.pageDims[newId] = { ...S.pageDims[srcId] };
    if (S.pageRotations[srcId] != null) S.pageRotations[newId] = S.pageRotations[srcId];
    newIds.push(newId);
  }
  S.pageOrder.splice(lastIdx + 1, 0, ...newIds);
  S.totalPages = S.pageOrder.length;
  S.currentPage = newIds[0];
  S.selectedIds = newIds.slice();
  S.selectionAnchor = newIds[0];
  pushHistory();
  refreshPageStructure(`${newIds.length}ページを複製しました`);
  document.getElementById('page-total').textContent = `/ ${S.totalPages}`;
  updateUndoRedo();
  updatePageEditButtons();
  showToast(`${newIds.length}ページを複製しました`, 'success');
}

function insertBlankPage(orderIndex) {
  if (!S.pdfDoc) return;
  const dims = inferBlankPageDims();
  const newId = nextPageId('blank');
  S.pageSources[newId] = { kind: 'blank', width: dims.width, height: dims.height };
  S.pageDims[newId] = { width: dims.width, height: dims.height };
  const insertAt = Math.min(S.pageOrder.length, Math.max(0, orderIndex));
  S.pageOrder.splice(insertAt, 0, newId);
  S.totalPages = S.pageOrder.length;
  S.currentPage = newId;
  S.selectedIds = [newId];
  S.selectionAnchor = newId;
  pushHistory();
  refreshPageStructure('白紙ページを挿入しました');
  document.getElementById('page-total').textContent = `/ ${S.totalPages}`;
  updateUndoRedo();
  updatePageEditButtons();
  showToast('白紙ページを挿入しました', 'success');
}

function movePagesToEdge(pageIds, toEnd) {
  if (!S.pdfDoc) return;
  const orderedIds = S.pageOrder.filter((id) => pageIds.includes(id));
  if (!orderedIds.length) return;
  for (const id of orderedIds) {
    const idx = S.pageOrder.indexOf(id);
    if (idx !== -1) S.pageOrder.splice(idx, 1);
  }
  if (toEnd) {
    S.pageOrder.push(...orderedIds);
  } else {
    S.pageOrder.unshift(...orderedIds);
  }
  S.currentPage = orderedIds[0];
  S.selectedIds = orderedIds.slice();
  S.selectionAnchor = orderedIds[0];
  pushHistory();
  refreshPageStructure(toEnd ? 'ページを末尾へ移動しました' : 'ページを先頭へ移動しました');
  updateUndoRedo();
}

async function mergePdfFile(file) {
  if (!S.pdfDoc) return;
  if (!file) return;
  const lower = file.name.toLowerCase();
  if (file.type && file.type !== 'application/pdf' && !lower.endsWith('.pdf')) {
    showToast('PDFファイルのみ対応しています', 'error');
    return;
  }
  if (!lower.endsWith('.pdf')) {
    showToast('PDFファイルのみ対応しています', 'error');
    return;
  }
  setBusy(true, '別PDFを読み込んで結合中...');
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const importDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    const sourceKey = nextPageId('src');
    S.importedPdfs[sourceKey] = { bytes, fileName: file.name };
    const newIds = [];
    for (let i = 0; i < importDoc.numPages; i++) {
      const newId = nextPageId('imp');
      S.pageSources[newId] = { kind: 'imported', sourceKey, sourceIndex: i };
      newIds.push(newId);
      // ページ寸法を取得しておく（サムネ生成のため）
      try {
        const p = await importDoc.getPage(i + 1);
        const vp = p.getViewport({ scale: 1 });
        S.pageDims[newId] = { width: vp.width, height: vp.height };
        p.cleanup();
      } catch (_) { /* 寸法取得に失敗したページは後続の既定値を使う */ }
    }
    // 結合元PDFのレンダリング用に保持（generateThumb / renderPage が参照）
    S.importedPdfs[sourceKey].pdfDoc = importDoc;
    S.pageOrder.push(...newIds);
    S.totalPages = S.pageOrder.length;
    S.currentPage = newIds[0];
    S.selectedIds = newIds.slice();
    S.selectionAnchor = newIds[0];
    pushHistory();
    refreshPageStructure(`${newIds.length}ページを結合しました`);
    document.getElementById('page-total').textContent = `/ ${S.totalPages}`;
    updateUndoRedo();
    updatePageEditButtons();
    showToast(`${file.name} (${newIds.length}ページ) を結合しました`, 'success');
  } catch (err) {
    console.error(err);
    showToast('PDFの結合に失敗しました', 'error');
  } finally {
    setBusy(false);
  }
}

async function extractPages(pageIds) {
  if (!S.pdfDoc) return;
  const orderedIds = S.pageOrder.filter((id) => pageIds.includes(id));
  if (!orderedIds.length) {
    showToast('抽出するページを選択してください', 'error');
    return;
  }
  setBusy(true, '選択ページを抽出中...');
  try {
    const bytes = await buildPdfBytes(orderedIds);
    const blob = new Blob([bytes.buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = S.fileName.replace(/\.pdf$/i, '') + `_extract_${orderedIds.length}p.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`${orderedIds.length}ページを抽出して保存しました`, 'success');
  } catch (err) {
    console.error(err);
    showToast('ページの抽出に失敗しました', 'error');
  } finally {
    setBusy(false);
  }
}

// Canvas/SVGの左上原点とPDFの左下原点を相互変換する。

function canvasToPdf(cx, cy, dims, zoom) {
  return { x: cx / zoom, y: dims.height - cy / zoom };
}

function pdfToCanvas(px, py, dims, zoom) {
  return { x: px * zoom, y: (dims.height - py) * zoom };
}

function canvasRectToPdf(x1, y1, x2, y2, dims, zoom) {
  const p1 = canvasToPdf(x1, y1, dims, zoom);
  const p2 = canvasToPdf(x2, y2, dims, zoom);
  return {
    x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y),
    width: Math.abs(p1.x - p2.x), height: Math.abs(p1.y - p2.y),
  };
}

function pdfRectToCanvas(r, dims, zoom) {
  const tl = pdfToCanvas(r.x, r.y + r.height, dims, zoom);
  return { x: tl.x, y: tl.y, width: r.width * zoom, height: r.height * zoom };
}

function hitTest(px, py, r, pad = 4) {
  return px >= r.x - pad && px <= r.x + r.width + pad &&
         py >= r.y - pad && py <= r.y + r.height + pad;
}

// PDF読込

async function loadPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  // 編集表示とは別に未編集文書を保持し、比較表示の基準にする。
  let originalDoc = null;
  try {
    originalDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  } catch (_) { originalDoc = null; }
  cancelAllRenderTasks();
  S.pdfDoc     = doc;
  S.originalPdfDoc = originalDoc;
  S.pdfBytes   = bytes;
  S.fileName   = file.name;
  S.pageIdCounter = 0;
  S.pageOrder  = Array.from({ length: doc.numPages }, (_, i) => i);
  S.totalPages = S.pageOrder.length;
  S.pageRotations = {};
  S.pageSources = {};
  S.importedPdfs = {};
  for (let i = 0; i < doc.numPages; i++) {
    S.pageSources[i] = { kind: 'source', sourceIndex: i };
  }
  S.currentPage = S.pageOrder[0] ?? 0;
  S.fitMode    = null;
  S.annotations = [];
  S.selectedId  = null;
  S.selectedAnnIds = [];
  S.selectedIds = [];
  S.selectionAnchor = null;
  S.pageDims    = {};
  S.textItems   = {};
  S.history     = [createSnapshot([], S.pageOrder, S.pageRotations, S.pageSources, S.pageDims)];
  S.histIdx     = 0;
  S.savedHistIdx = 0;
  S.compareMode = 'off';
  S.compareDiff = false;
  S.compareTempActive = false;
  // 別PDFへ装飾設定を持ち越さない。
  S.watermarkConfig = { enabled: false, text: '', fontSize: 80, color: '#e53e3e', opacity: 0.2, angle: -30, placement: 'center', scope: 'all', appliedToPageId: null };
  S.pageNumberConfig = { enabled: false, format: '{n}/{total}', customFormat: '', position: 'bc', fontSize: 11, color: '#1a202c', start: 1, fromPage: 1, offsetX: 0, offsetY: 0 };
  S.headerFooterConfig = {
    header: { enabled: false, text: '', align: 'center', fontSize: 11, color: '#1a202c' },
    footer: { enabled: false, text: '', align: 'center', fontSize: 11, color: '#1a202c' },
  };
  // リセット後の全状態をUndoの起点として再登録する。
  S.history = [createSnapshot([], S.pageOrder, S.pageRotations, S.pageSources, S.pageDims)];
  S.histIdx = 0;
  S.savedHistIdx = 0;
  // 検索索引は元PDFに紐づくため破棄する。
  S.searchIndex = null;
  S.searchIndexBuilding = false;
  S.searchResults = [];
  S.searchActiveIndex = -1;
  S.searchQuery = '';
  closeSearchBar();
  setDirty(false);
  // 新しいPDFのメタデータで再初期化できるよう、手動編集フラグを戻す。
  for (const k of Object.keys(S.saveSettings.metadataUserEdited)) {
    S.saveSettings.metadataUserEdited[k] = false;
  }
  S.saveSettings.metadata = { title: '', author: '', subject: '', keywords: [], producer: '', creator: '' };
  prefillMetadataFromPdf();
  onPdfLoaded();
}

function onPdfLoaded() {
  document.getElementById('btn-save').style.display = '';
  document.getElementById('btn-merge').style.display = '';
  document.getElementById('btn-extract').style.display = '';
  const btnRestore = document.getElementById('btn-restore-project');
  if (btnRestore) btnRestore.disabled = false;
  const btnSearch = document.getElementById('btn-search');
  if (btnSearch) btnSearch.style.display = '';
  const btnCompare = document.getElementById('btn-compare');
  if (btnCompare) btnCompare.style.display = '';
  document.getElementById('nav-group').style.display = '';
  document.getElementById('file-name').textContent  = S.fileName;
  document.getElementById('page-total').textContent = `/ ${S.totalPages}`;
  document.getElementById('drop-hint').style.display = 'none';
  updateUndoRedo();
  updatePageEditButtons();
  updateCompareUI();
  renderThumbnails();
  renderViewer();
  setStatus(`${S.fileName} / ${S.totalPages}ページ`);
}

// PDF保存

function cssToRgb(color) {
  const h = color.replace('#', '');
  const full = h.length === 3
    ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
    : h;
  return {
    r: parseInt(full.slice(0,2), 16) / 255,
    g: parseInt(full.slice(2,4), 16) / 255,
    b: parseInt(full.slice(4,6), 16) / 255,
  };
}

function dataUrlToUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function textToPngBytes(text, options) {
  const scale = 3;
  const fontSize = Math.max(8, options.fontSize || 14);
  const width = Math.max(24, options.width || 160);
  const height = Math.max(fontSize * 1.6, options.height || fontSize * 1.8);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');

  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = options.color || '#1a202c';
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.fontKerning = 'normal';
  ctx.textBaseline = 'top';

  const lineHeight = fontSize * 1.25;
  const lines = String(text || '').split(/\r?\n/);
  let y = Math.max(0, (height - lineHeight * lines.length) / 2);
  for (const line of lines) {
    ctx.fillText(line, 2, y);
    y += lineHeight;
  }

  return dataUrlToUint8Array(canvas.toDataURL('image/png'));
}

async function drawRasterText(page, pdfDoc, ann) {
  const r = ann.rect;
  if (ann.bgColor !== 'transparent') {
    const bg = cssToRgb(ann.bgColor || '#ffffff');
    page.drawRectangle({
      x: r.x - 1, y: r.y - 1, width: r.width + 2, height: r.height + 2,
      color: PDFLib.rgb(bg.r, bg.g, bg.b), opacity: 1,
    });
  }

  if (!ann.text) return;
  const pngBytes = textToPngBytes(ann.text, {
    width: r.width,
    height: r.height,
    fontSize: ann.fontSize,
    color: ann.fontColor,
  });
  const png = await pdfDoc.embedPng(pngBytes);
  page.drawImage(png, { x: r.x, y: r.y, width: r.width, height: r.height, opacity: ann.opacity ?? 1 });
}

async function buildPdfBytes(pageIds, options = {}) {
  const { PDFDocument, rgb, LineCapStyle, degrees } = PDFLib;
  const flatten = options.flatten === true;
  const metadata = options.metadata || null;
  const srcDoc = await PDFDocument.load(S.pdfBytes);
  // 結合元PDFは sourceKey ごとに一度だけロード
  const importedDocs = {};
  for (const key of Object.keys(S.importedPdfs)) {
    const used = pageIds.some((id) => getPageSource(id).sourceKey === key);
    if (!used) continue;
    importedDocs[key] = await PDFDocument.load(S.importedPdfs[key].bytes);
  }
  const pdfDoc = await PDFDocument.create();
  const pageById = new Map();

  // ページソース別にまとめて copyPages を呼ぶと効率がよい
  // ただし順序を保つため都度コピーする
  for (const pageId of pageIds) {
    const src = getPageSource(pageId);
    let page = null;
    if (src.kind === 'blank') {
      const w = src.width || S.pageDims[pageId]?.width || BLANK_PAGE_DEFAULTS.width;
      const h = src.height || S.pageDims[pageId]?.height || BLANK_PAGE_DEFAULTS.height;
      page = pdfDoc.addPage([w, h]);
    } else if (src.sourceKey && importedDocs[src.sourceKey]) {
      // imported または imported を複製したページ
      const [copied] = await pdfDoc.copyPages(importedDocs[src.sourceKey], [src.sourceIndex]);
      page = pdfDoc.addPage(copied);
    } else {
      // source / duplicate（複製は元PDFから再コピー）
      const [copied] = await pdfDoc.copyPages(srcDoc, [src.sourceIndex]);
      page = pdfDoc.addPage(copied);
    }
    const baseAngle = page.getRotation?.().angle || 0;
    const angle = normalizeRotation(baseAngle + getPageRotation(pageId));
    page.setRotation(degrees(angle));
    pageById.set(pageId, page);
  }

  for (const ann of S.annotations) {
    const page = pageById.get(ann.pageIndex);
    if (!page) continue;
    const r = ann.rect;

    switch (ann.type) {
      case 'rectangle': {
        const sc = cssToRgb(ann.color);
        const fc = ann.fillColor ? cssToRgb(ann.fillColor) : null;
        page.drawRectangle({
          x: r.x, y: r.y, width: r.width, height: r.height,
          borderColor: rgb(sc.r, sc.g, sc.b), borderWidth: ann.strokeWidth, borderOpacity: ann.opacity,
          color: fc ? rgb(fc.r, fc.g, fc.b) : undefined,
          opacity: fc ? ann.opacity : undefined,
        });
        break;
      }
      case 'circle': {
        const sc = cssToRgb(ann.color);
        const fc = ann.fillColor ? cssToRgb(ann.fillColor) : null;
        page.drawEllipse({
          x: r.x + r.width/2, y: r.y + r.height/2,
          xScale: r.width/2, yScale: r.height/2,
          borderColor: rgb(sc.r, sc.g, sc.b), borderWidth: ann.strokeWidth, borderOpacity: ann.opacity,
          color: fc ? rgb(fc.r, fc.g, fc.b) : undefined,
          opacity: fc ? ann.opacity : undefined,
        });
        break;
      }
      case 'line': {
        const c = cssToRgb(ann.color);
        page.drawLine({ start: ann.startPoint, end: ann.endPoint, color: rgb(c.r,c.g,c.b), thickness: ann.strokeWidth, opacity: ann.opacity });
        break;
      }
      case 'arrow': {
        const c = cssToRgb(ann.color);
        const col = rgb(c.r,c.g,c.b);
        const { startPoint: s, endPoint: e } = ann;
        page.drawLine({ start: s, end: e, color: col, thickness: ann.strokeWidth, opacity: ann.opacity });
        const dx = e.x-s.x, dy = e.y-s.y, len = Math.sqrt(dx*dx+dy*dy);
        if (len > 1) {
          const as = Math.max(ann.strokeWidth*4, 10);
          const nx = dx/len, ny = dy/len, px = -ny, py = nx;
          const path = `M ${e.x} ${e.y} L ${e.x-nx*as+px*as/2} ${e.y-ny*as+py*as/2} L ${e.x-nx*as-px*as/2} ${e.y-ny*as-py*as/2} Z`;
          page.drawSvgPath(path, { color: col, opacity: ann.opacity });
        }
        break;
      }
      case 'ink': {
        const c = cssToRgb(ann.color);
        for (const stroke of ann.inkLists) {
          if (stroke.length < 2) continue;
          const path = 'M ' + stroke[0].x + ' ' + stroke[0].y +
            stroke.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('');
          page.drawSvgPath(path, {
            borderColor: rgb(c.r,c.g,c.b), borderWidth: ann.strokeWidth,
            borderOpacity: ann.opacity, borderLineCap: LineCapStyle.Round,
          });
        }
        break;
      }
      case 'freetext': {
        await drawRasterText(page, pdfDoc, { ...ann, bgColor: 'transparent' });
        break;
      }
      case 'textedit': {
        await drawRasterText(page, pdfDoc, ann);
        break;
      }
      case 'highlight': {
        const c = cssToRgb(ann.color);
        page.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, color: rgb(c.r,c.g,c.b), opacity: Math.min(ann.opacity, 0.4) });
        break;
      }
      case 'redaction': {
        // 墨消しは注釈を残さず、完全不透明の黒矩形として本文へ焼き込む。
        page.drawRectangle({ x: r.x, y: r.y, width: r.width, height: r.height, color: rgb(0, 0, 0), opacity: 1 });
        break;
      }
      case 'image':
      case 'signature': {
        await drawEmbeddedImage(page, pdfDoc, ann);
        break;
      }
      case 'stamp': {
        await drawStampAnnotation(page, pdfDoc, ann);
        break;
      }
      case 'qrcode': {
        await drawQrAnnotation(page, pdfDoc, ann);
        break;
      }
    }
  }

  // 透かし・ページ番号・ヘッダー・フッターはページ再構成後に適用する。
  for (const pageId of pageIds) {
    const page = pageById.get(pageId);
    if (!page) continue;
    const orderIndex = pageIds.indexOf(pageId);
    await applyPhase4PageDecorations(page, pdfDoc, pageId, orderIndex, pageIds.length);
  }

  // フラット化ではコピー元PDFの注釈オブジェクトを削除し、編集結果だけを残す。
  if (flatten) {
    try {
      const PDFName = PDFLib.PDFName;
      for (const page of pdfDoc.getPages()) {
        try { page.node.delete(PDFName.of('Annots')); } catch (_) { /* 注釈辞書がないページはそのまま保存する */ }
      }
    } catch (err) {
      console.warn('flatten: failed to strip Annots', err);
    }
  }

  // 保存直前にメタデータを反映する。
  applyPdfMetadata(pdfDoc, metadata, { flatten });

  return pdfDoc.save();
}

// フラット化時は生成元情報を残しにくいよう、Producer/Creatorを空に近づける。
function applyPdfMetadata(pdfDoc, metadata, opts = {}) {
  const flatten = !!opts.flatten;
  const safeSet = (fnName, value) => {
    try {
      if (typeof pdfDoc[fnName] === 'function') pdfDoc[fnName](value);
    } catch (err) {
      console.warn(`applyPdfMetadata: ${fnName} failed`, err);
    }
  };
  if (metadata) {
    if (typeof metadata.title === 'string')   safeSet('setTitle', metadata.title);
    if (typeof metadata.author === 'string')  safeSet('setAuthor', metadata.author);
    if (typeof metadata.subject === 'string') safeSet('setSubject', metadata.subject);
    if (Array.isArray(metadata.keywords))     safeSet('setKeywords', metadata.keywords);
    else if (typeof metadata.keywords === 'string')
      safeSet('setKeywords', parseKeywordsInput(metadata.keywords));
    if (typeof metadata.producer === 'string') {
      safeSet('setProducer', metadata.producer || (flatten ? '' : metadata.producer));
    } else if (flatten) {
      safeSet('setProducer', '');
    }
    if (typeof metadata.creator === 'string') {
      safeSet('setCreator', metadata.creator || (flatten ? '' : metadata.creator));
    } else if (flatten) {
      safeSet('setCreator', '');
    }
  } else if (flatten) {
    safeSet('setProducer', '');
    safeSet('setCreator', '');
  }
}

// キーワード入力は半角カンマ・読点のどちらでも分割する。
function parseKeywordsInput(raw) {
  if (Array.isArray(raw)) return raw.filter((k) => typeof k === 'string' && k.trim()).map((k) => k.trim());
  return String(raw || '')
    .split(/[、,]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

function keywordsToString(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value == null ? '' : String(value);
}

// 画像注釈をPNG/JPEGとしてPDFへ埋め込む。
async function drawEmbeddedImage(page, pdfDoc, ann) {
  if (!ann.src) return;
  try {
    const bytes = dataUrlToUint8Array(ann.src);
    const lower = (ann.mime || '').toLowerCase();
    let img;
    if (lower.includes('jpeg') || lower.includes('jpg')) {
      img = await pdfDoc.embedJpg(bytes);
    } else if (lower.includes('png')) {
      img = await pdfDoc.embedPng(bytes);
    } else {
      // フォールバック: 一度 canvas で PNG 化
      const png = await convertToPngDataUrl(ann.src);
      img = await pdfDoc.embedPng(dataUrlToUint8Array(png));
    }
    const r = ann.rect;
    page.drawImage(img, { x: r.x, y: r.y, width: r.width, height: r.height, opacity: ann.opacity ?? 1 });
  } catch (err) {
    console.error('drawEmbeddedImage failed', err);
  }
}

async function convertToPngDataUrl(srcDataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width;
      c.height = img.naturalHeight || img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = srcDataUrl;
  });
}

// スタンプは矩形と文字を一度画像化し、PDF側の描画差を抑える。
async function drawStampAnnotation(page, pdfDoc, ann) {
  const r = ann.rect;
  const pngBytes = stampToPngBytes(ann);
  const png = await pdfDoc.embedPng(pngBytes);
  page.drawImage(png, { x: r.x, y: r.y, width: r.width, height: r.height, opacity: ann.opacity ?? 1 });
}

function stampToPngBytes(ann) {
  const scale = 4;
  const r = ann.rect;
  const width = Math.max(40, r.width);
  const height = Math.max(20, r.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  const sw = ann.strokeWidth ?? 2;
  if (ann.borderColor && sw > 0) {
    ctx.strokeStyle = ann.borderColor;
    ctx.lineWidth = sw;
    const pad = sw / 2;
    ctx.strokeRect(pad, pad, width - sw, height - sw);
  }
  const fontSize = ann.fontSize || 24;
  ctx.fillStyle = ann.color || '#e53e3e';
  ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ann.text || '', width / 2, height / 2);

  return dataUrlToUint8Array(canvas.toDataURL('image/png'));
}

// QRコードは拡大時もぼけないよう、pdf-libの矩形群として描画する。
async function drawQrAnnotation(page, pdfDoc, ann) {
  if (!ann.text) return;
  let qr;
  try {
    qr = globalThis.QRCodeGen?.generate(ann.text, ann.errorLevel || 'M');
  } catch (err) {
    console.error('QR generation failed', err);
    return;
  }
  if (!qr) return;
  const r = ann.rect;
  const cell = Math.min(r.width, r.height) / qr.size;
  const bg = cssToRgb(ann.bgColor || '#ffffff');
  const fg = cssToRgb(ann.fgColor || '#000000');
  const { rgb } = PDFLib;
  // 背景
  page.drawRectangle({ x: r.x, y: r.y, width: cell * qr.size, height: cell * qr.size, color: rgb(bg.r, bg.g, bg.b), opacity: 1 });
  // モジュール
  for (let row = 0; row < qr.size; row++) {
    for (let col = 0; col < qr.size; col++) {
      if (!qr.modules[row][col]) continue;
      const x = r.x + col * cell;
      // QR 行 0 は最上段。PDF 座標 y は下端基準なので反転
      const y = r.y + (qr.size - row - 1) * cell;
      page.drawRectangle({ x, y, width: cell, height: cell, color: rgb(fg.r, fg.g, fg.b), opacity: 1 });
    }
  }
}

// 透かし・ページ番号・ヘッダー・フッターを全ページへ適用する。
async function applyPhase4PageDecorations(page, pdfDoc, pageId, orderIndex, total) {
  const { width: pw, height: ph } = page.getSize();
  // 透かし
  const wm = S.watermarkConfig;
  if (wm?.enabled && wm.text) {
    const scopeOk = wm.scope === 'all' || (wm.scope === 'current' && wm.appliedToPageId === pageId);
    if (scopeOk) {
      await drawWatermarkOnPage(page, pdfDoc, pw, ph, wm);
    }
  }
  // ページ番号
  const pn = S.pageNumberConfig;
  if (pn?.enabled) {
    const from = Math.max(1, pn.fromPage || 1);
    if (orderIndex + 1 >= from) {
      const n = (pn.start ?? 1) + (orderIndex + 1 - from);
      const fmt = pn.format === 'custom' ? (pn.customFormat || '{n}/{total}') : pn.format;
      const txt = String(fmt || '').replace(/\{n\}/g, n).replace(/\{total\}/g, total);
      if (txt) await drawTextBoxOnPage(page, pdfDoc, pw, ph, txt, pn.position, pn.fontSize || 11, pn.color || '#1a202c', 0.95, { x: pn.offsetX || 0, y: pn.offsetY || 0 });
    }
  }
  // ヘッダー / フッター
  const hf = S.headerFooterConfig;
  if (hf?.header?.enabled && hf.header.text) {
    const pos = hf.header.align === 'left' ? 'tl' : hf.header.align === 'right' ? 'tr' : 'tc';
    await drawTextBoxOnPage(page, pdfDoc, pw, ph, hf.header.text, pos, hf.header.fontSize || 11, hf.header.color || '#1a202c', 0.95);
  }
  if (hf?.footer?.enabled && hf.footer.text) {
    const pos = hf.footer.align === 'left' ? 'bl' : hf.footer.align === 'right' ? 'br' : 'bc';
    await drawTextBoxOnPage(page, pdfDoc, pw, ph, hf.footer.text, pos, hf.footer.fontSize || 11, hf.footer.color || '#1a202c', 0.95);
  }
}

function measureTextSize(text, fontSize) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif`;
  const lines = String(text || '').split(/\r?\n/);
  let maxW = 0;
  for (const line of lines) {
    const m = ctx.measureText(line);
    if (m.width > maxW) maxW = m.width;
  }
  return { width: Math.max(20, maxW + 8), height: Math.max(fontSize * 1.4, fontSize * 1.4 * lines.length) };
}

async function drawWatermarkOnPage(page, pdfDoc, pw, ph, wm) {
  const fontSize = Math.max(10, wm.fontSize || 60);
  const measured = measureTextSize(wm.text, fontSize);
  const width = measured.width;
  const height = measured.height;
  const tile = wm.placement === 'diagonal-tile';
  if (tile) {
    const stepX = width * 1.6;
    const stepY = height * 3.4;
    for (let y = -height; y < ph + height; y += stepY) {
      for (let x = -width; x < pw + width; x += stepX) {
        await drawWatermarkAt(page, pdfDoc, x, y, width, height, wm);
      }
    }
  } else {
    const cx = pw / 2 - width / 2;
    const cy = ph / 2 - height / 2;
    await drawWatermarkAt(page, pdfDoc, cx, cy, width, height, wm);
  }
}

async function drawWatermarkAt(page, pdfDoc, x, y, width, height, wm) {
  const pngBytes = textToPngBytes(wm.text, {
    width, height,
    fontSize: wm.fontSize,
    color: wm.color,
  });
  const png = await pdfDoc.embedPng(pngBytes);
  const { degrees } = PDFLib;
  const angle = wm.angle || 0;
  // 中心回りに回転して描画（drawImage の rotate は左下原点）
  // 回転後の位置を中心一致させるために、左下を求めてオフセット
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  // 元矩形の左下を、回転後に中心が (cx, cy) になるよう逆算
  const dx = -width / 2, dy = -height / 2;
  const lx = cx + dx * cos - dy * sin;
  const ly = cy + dx * sin + dy * cos;
  page.drawImage(png, {
    x: lx, y: ly,
    width, height,
    opacity: wm.opacity ?? 0.2,
    rotate: degrees(angle),
  });
}

// テキストボックス（ページ番号 / ヘッダー / フッター用）
async function drawTextBoxOnPage(page, pdfDoc, pw, ph, text, position, fontSize, color, opacity, offset) {
  // 実測サイズ
  const measured = measureTextSize(text, fontSize);
  const w = measured.width;
  const h = measured.height;
  const margin = Math.max(12, fontSize * 1.2);
  let x = margin, y = margin;
  // PDF 座標 y は下端基準
  switch (position) {
    case 'tl': x = margin; y = ph - margin - h; break;
    case 'tc': x = pw / 2 - w / 2; y = ph - margin - h; break;
    case 'tr': x = pw - margin - w; y = ph - margin - h; break;
    case 'bl': x = margin; y = margin; break;
    case 'bc': x = pw / 2 - w / 2; y = margin; break;
    case 'br': x = pw - margin - w; y = margin; break;
  }
  // 位置調整値はPDF座標系を使うため、Yの正方向は画面表示と逆になる。
  if (offset) {
    x += offset.x || 0;
    y += offset.y || 0;
  }
  const pngBytes = textToPngBytes(text, { width: w, height: h, fontSize, color });
  const png = await pdfDoc.embedPng(pngBytes);
  page.drawImage(png, { x, y, width: w, height: h, opacity: opacity ?? 1 });
}

async function savePdf() {
  const bytes = await buildPdfBytes(S.pageOrder.slice());
  const blob  = new Blob([bytes.buffer], { type: 'application/pdf' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = S.fileName.replace(/\.pdf$/i, '') + '_edited.pdf';
  a.click(); URL.revokeObjectURL(url);
  S.savedHistIdx = S.histIdx;
  setDirty(false);
}

// サムネイルは論理ページ順序の編集UIを兼ねる。

const SOURCE_TAG_LABEL = { blank: '白紙', duplicate: '複製', imported: '結合' };

function renderThumbnails() {
  const panel = document.getElementById('thumbnail-panel');
  panel.tabIndex = -1;
  panel.innerHTML = '';

  for (const [displayIndex, pageId] of S.pageOrder.entries()) {
    const item = document.createElement('div');
    const isActive = pageId === S.currentPage;
    const isMulti = S.selectedIds.includes(pageId);
    item.className = `thumb-item${isActive ? ' active' : ''}${isMulti ? ' multi-selected' : ''}`;
    item.dataset.page = pageId;
    item.dataset.order = displayIndex;
    item.draggable = true;
    const src = getPageSource(pageId);
    const tag = SOURCE_TAG_LABEL[src.kind] || '';
    item.innerHTML = `
      <div class="thumb-img-wrap"><div class="thumb-placeholder"></div></div>
      ${tag ? `<span class="thumb-source-tag" data-kind="${src.kind}">${tag}</span>` : ''}
      <div class="thumb-actions">
        <button type="button" class="thumb-action" data-thumb-action="rotate-left" title="左に回転">&#8634;</button>
        <button type="button" class="thumb-action" data-thumb-action="rotate-right" title="右に回転">&#8635;</button>
      </div>
      <span class="thumb-num">${displayIndex + 1}</span>
    `;
    const srcLabel = src.kind === 'blank' ? '白紙'
      : src.kind === 'duplicate' ? `複製 (元: ${(src.sourceIndex ?? 0) + 1})`
      : src.kind === 'imported' ? `結合 (${S.importedPdfs[src.sourceKey]?.fileName || ''} p${(src.sourceIndex ?? 0) + 1})`
      : `元PDF p${(src.sourceIndex ?? 0) + 1}`;
    item.title = `Page ${displayIndex + 1} (${srcLabel})`;
    item.addEventListener('click', (e) => {
      if (e.target.closest('.thumb-action')) return;
      handleThumbClick(e, pageId);
    });
    item.addEventListener('dragstart', (e) => {
      if (e.target.closest('.thumb-action')) {
        e.preventDefault();
        return;
      }
      // ドラッグ対象が複数選択に含まれていない場合は選択を置き換える
      if (!S.selectedIds.includes(pageId)) {
        S.selectedIds = [pageId];
        S.selectionAnchor = pageId;
        S.currentPage = pageId;
        updateThumbActive();
        updatePageEditButtons();
      }
      item.classList.add('dragging');
      const movingIds = S.selectedIds.length > 1 && S.selectedIds.includes(pageId)
        ? S.selectedIds
        : [pageId];
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-pdf-page-index', String(pageId));
      e.dataTransfer.setData('application/x-pdf-page-ids', JSON.stringify(movingIds));
      e.dataTransfer.setData('text/plain', String(pageId));
    });
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      clearThumbDropMarkers();
      panel.classList.remove('dropping-end');
    });
    item.addEventListener('dragover', (e) => {
      if (!Array.from(e.dataTransfer.types || []).includes('application/x-pdf-page-index')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearThumbDropMarkers(item);
      panel.classList.remove('dropping-end');
      item.classList.toggle('drop-after', thumbDropAfter(e, item));
      item.classList.toggle('drop-before', !thumbDropAfter(e, item));
    });
    item.addEventListener('dragleave', () => {
      item.classList.remove('drop-before', 'drop-after');
    });
    item.addEventListener('drop', (e) => {
      const draggedRaw = e.dataTransfer.getData('application/x-pdf-page-index');
      const dragged = parsePageId(draggedRaw);
      if (dragged == null) return;
      e.preventDefault();
      const after = thumbDropAfter(e, item);
      clearThumbDropMarkers();
      movePageNear(dragged, pageId, after);
    });
    item.querySelector('[data-thumb-action="rotate-left"]').addEventListener('click', (e) => {
      e.stopPropagation();
      rotatePage(pageId, -90);
    });
    item.querySelector('[data-thumb-action="rotate-right"]').addEventListener('click', (e) => {
      e.stopPropagation();
      rotatePage(pageId, 90);
    });
    panel.appendChild(item);
  }

  // パネル末尾へドロップ → 末尾に移動
  panel.addEventListener('dragover', panelDragOver);
  panel.addEventListener('dragleave', panelDragLeave);
  panel.addEventListener('drop', panelDrop);

  // IntersectionObserver でビューポートに入ったサムネイルだけ生成
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = parsePageId(entry.target.dataset.page);
      if (id == null) return;
      const wrap = entry.target.querySelector('.thumb-img-wrap');
      if (wrap.querySelector('img') || wrap.querySelector('canvas')) return;
      observer.unobserve(entry.target);
      generateThumb(id).then((url) => {
        if (url) wrap.innerHTML = `<img src="${url}" alt="p${getPageOrderIndex(id) + 1}">`;
      }).catch(() => { /* noop */ });
    });
  }, { root: panel, rootMargin: '100px', threshold: 0.1 });

  panel.querySelectorAll('.thumb-item').forEach((el) => observer.observe(el));
}

function panelDragOver(e) {
  const types = Array.from(e.dataTransfer.types || []);
  if (!types.includes('application/x-pdf-page-index')) return;
  // 末尾サムネより下にカーソルがある場合のみ
  const panel = e.currentTarget;
  const items = panel.querySelectorAll('.thumb-item');
  if (!items.length) return;
  const last = items[items.length - 1];
  const rect = last.getBoundingClientRect();
  if (e.clientY > rect.bottom) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearThumbDropMarkers();
    panel.classList.add('dropping-end');
  }
}

function panelDragLeave(e) {
  if (e.currentTarget === e.target) e.currentTarget.classList.remove('dropping-end');
}

function panelDrop(e) {
  const panel = e.currentTarget;
  if (!panel.classList.contains('dropping-end')) return;
  e.preventDefault();
  panel.classList.remove('dropping-end');
  const draggedRaw = e.dataTransfer.getData('application/x-pdf-page-index');
  const dragged = parsePageId(draggedRaw);
  if (dragged == null) return;
  const lastId = S.pageOrder[S.pageOrder.length - 1];
  if (lastId == null || lastId === dragged) return;
  movePageNear(dragged, lastId, true);
}

function handleThumbClick(e, pageId) {
  if (e.shiftKey && S.selectionAnchor != null && S.pageOrder.includes(S.selectionAnchor)) {
    const a = S.pageOrder.indexOf(S.selectionAnchor);
    const b = S.pageOrder.indexOf(pageId);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    S.selectedIds = S.pageOrder.slice(lo, hi + 1);
    S.currentPage = pageId;
  } else if (e.ctrlKey || e.metaKey) {
    if (S.selectedIds.includes(pageId)) {
      S.selectedIds = S.selectedIds.filter((id) => id !== pageId);
    } else {
      S.selectedIds = [...S.selectedIds, pageId];
    }
    S.selectionAnchor = pageId;
    S.currentPage = pageId;
  } else {
    S.selectedIds = [pageId];
    S.selectionAnchor = pageId;
    S.currentPage = pageId;
  }
  updatePageNav();
  if (S.viewMode === 'single') {
    renderViewer();
  } else {
    const pw = document.querySelector(`.page-wrapper${pageDataSelector(pageId)}`);
    if (pw) pw.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  updateThumbActive();
  updatePageEditButtons();
}

function thumbDropAfter(e, item) {
  const rect = item.getBoundingClientRect();
  return e.clientY > rect.top + rect.height / 2;
}

function clearThumbDropMarkers(except = null) {
  document.querySelectorAll('.thumb-item.drop-before, .thumb-item.drop-after').forEach((el) => {
    if (el !== except) el.classList.remove('drop-before', 'drop-after');
  });
}

async function resolveSourcePageForId(pageId) {
  const src = getPageSource(pageId);
  if (src.kind === 'blank') return null;
  if (src.sourceKey) {
    const entry = S.importedPdfs[src.sourceKey];
    if (!entry) return null;
    if (!entry.pdfDoc) {
      entry.pdfDoc = await pdfjsLib.getDocument({ data: entry.bytes.slice() }).promise;
    }
    return entry.pdfDoc.getPage(src.sourceIndex + 1);
  }
  return S.pdfDoc.getPage(src.sourceIndex + 1);
}

async function generateThumb(pageId) {
  const src = getPageSource(pageId);
  if (src.kind === 'blank') {
    const w = src.width || BLANK_PAGE_DEFAULTS.width;
    const h = src.height || BLANK_PAGE_DEFAULTS.height;
    const rot = getPageRotation(pageId);
    const displayW = rot % 180 === 0 ? w : h;
    const displayH = rot % 180 === 0 ? h : w;
    const scale = 160 / displayW;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(displayW * scale);
    canvas.height = Math.ceil(displayH * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cbd5e0';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
    return canvas.toDataURL('image/png');
  }
  const page = await resolveSourcePageForId(pageId);
  if (!page) return null;
  const rotation = normalizeRotation((page.rotate || 0) + getPageRotation(pageId));
  const vp    = page.getViewport({ scale: 1.0, rotation });
  const scale = 160 / vp.width;
  const svp   = page.getViewport({ scale, rotation });
  const canvas = document.createElement('canvas');
  canvas.width  = svp.width;
  canvas.height = svp.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: svp }).promise;
  return canvas.toDataURL('image/jpeg', 0.7);
}

function updateThumbActive() {
  document.querySelectorAll('.thumb-item').forEach((el) => {
    const id = parsePageId(el.dataset.page);
    el.classList.toggle('active', id === S.currentPage);
    el.classList.toggle('multi-selected', S.selectedIds.includes(id));
  });
  const active = document.querySelector('.thumb-item.active');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// 表示モードごとにページCanvasを再構成するビューアー。

function renderViewer() {
  const viewer = document.getElementById('viewer');
  // 進行中のレンダリングをすべてキャンセル（連続ズーム/ページ切替に追従）
  cancelAllRenderTasks();
  viewer.innerHTML = '';
  viewer.classList.toggle('compare-split', S.compareMode === 'split');
  viewer.classList.toggle('compare-before', isShowingBefore());

  const pages = S.viewMode === 'single'
    ? [S.currentPage]
    : S.pageOrder.slice();

  const splitMode = S.compareMode === 'split';
  const showBefore = isShowingBefore();

  pages.forEach((pageId) => {
    if (pageId == null) return;

    if (splitMode) {
      // 左右分割: Before（左）と After（右）を横並びで表示する
      const pair = document.createElement('div');
      pair.className = 'compare-pair';
      pair.dataset.page = pageId;

      const beforeWrap = buildPageWrapper(pageId, { variant: 'before' });
      const afterWrap = buildPageWrapper(pageId, { variant: 'after' });
      pair.appendChild(beforeWrap);
      pair.appendChild(afterWrap);
      viewer.appendChild(pair);

      renderPage(pageId, beforeWrap.querySelector('canvas'), beforeWrap, { beforeOnly: true });
      renderPage(pageId, afterWrap.querySelector('canvas'), afterWrap, { beforeOnly: false });
      return;
    }

    const wrapper = buildPageWrapper(pageId, { variant: showBefore ? 'before' : 'normal' });
    viewer.appendChild(wrapper);
    renderPage(pageId, wrapper.querySelector('canvas'), wrapper, { beforeOnly: showBefore });
  });

  // 連続モード: IntersectionObserver で currentPage 更新
  if (S.viewMode === 'continuous') {
    const pageObs = new IntersectionObserver((entries) => {
      let bestId = null, bestR = 0;
      entries.forEach((e) => {
        if (e.intersectionRatio > bestR) {
          bestR = e.intersectionRatio;
          bestId = parsePageId(e.target.dataset.page);
        }
      });
      if (bestId != null && bestId !== S.currentPage) {
        S.currentPage = bestId;
        updatePageNav();
        updateThumbActive();
      }
    }, {
      root: viewer,
      threshold: Array.from({ length: 11 }, (_, i) => i / 10),
    });
    // Before 単独表示時も .page-wrapper を observe する（split 時は pair をまとめて）
    if (S.compareMode === 'split') {
      viewer.querySelectorAll('.compare-pair').forEach((el) => pageObs.observe(el));
    } else {
      viewer.querySelectorAll('.page-wrapper').forEach((el) => pageObs.observe(el));
    }
  }
}

function buildPageWrapper(pageId, { variant }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'page-wrapper';
  wrapper.dataset.page = pageId;
  wrapper.dataset.variant = variant; // 'normal' | 'before' | 'after'

  const surface = document.createElement('div');
  surface.className = 'page-surface';
  surface.dataset.page = pageId;

  const canvas = document.createElement('canvas');
  surface.appendChild(canvas);
  wrapper.appendChild(surface);

  if (variant === 'before' || variant === 'after') {
    const badge = document.createElement('div');
    badge.className = `compare-badge compare-badge-${variant}`;
    badge.textContent = variant === 'before' ? 'Before（元PDF）' : 'After（編集後）';
    wrapper.appendChild(badge);
  }

  const label = document.createElement('div');
  label.className = 'page-num-label';
  label.textContent = getPageOrderIndex(pageId) + 1;
  wrapper.appendChild(label);

  return wrapper;
}

function isShowingBefore() {
  if (!S.pdfDoc) return false;
  if (S.compareMode === 'split') return false;
  if (S.compareTempActive) return true;
  return S.compareMode === 'before';
}

function hasBeforeForPage(pageId) {
  const src = getPageSource(pageId);
  if (!src) return false;
  // 元PDFから来たページのみ Before を持つ
  if (src.kind === 'source') return !!S.originalPdfDoc;
  if (src.kind === 'duplicate' && !src.sourceKey) return !!S.originalPdfDoc;
  return false;
}

// レンダリングタスク管理（ページごとに最新タスクを保持し、再呼び出し時にキャンセル）
const renderTasks = new Map(); // pageIndex -> { task, token }
let renderTokenCounter = 0;

function cancelPageRender(pageIndex) {
  const entry = renderTasks.get(pageIndex);
  if (!entry) return;
  try { entry.task?.cancel(); } catch (_) { /* noop */ }
  renderTasks.delete(pageIndex);
}

function cancelAllRenderTasks() {
  for (const [, entry] of renderTasks) {
    try { entry.task?.cancel(); } catch (_) { /* noop */ }
  }
  renderTasks.clear();
}

async function renderPage(pageId, canvas, wrapper, opts = {}) {
  if (!S.pdfDoc) return;
  const beforeOnly = !!opts.beforeOnly;
  // Before モード: 元PDFのページを使い、回転/注釈/差し替えは無視する。
  // 対応する元ページが無いページ（白紙 / 結合 / 結合の複製）は Before 不可表示にする
  if (beforeOnly) {
    renderBeforePage(pageId, canvas, wrapper);
    return;
  }
  // 既存タスクをキャンセルし、本呼び出しのトークンを発行
  // 同じページが Before / After 両方で描画される場合があるが、renderTasks は After 用のみ管理
  cancelPageRender(pageId);
  const token = ++renderTokenCounter;
  // プレースホルダー登録。後続の renderPage / cancelAllRenderTasks に上書き or 削除される
  renderTasks.set(pageId, { task: null, token });

  // 別の renderPage 呼び出しに上書きされたら stale
  const isStale = () => {
    const e = renderTasks.get(pageId);
    return !e || e.token !== token;
  };

  const surface = wrapper.querySelector('.page-surface');
  const rotation = getPageRotation(pageId);
  const src = getPageSource(pageId);

  // 白紙ページはローカルで描画
  if (src.kind === 'blank') {
    const w = src.width || S.pageDims[pageId]?.width || BLANK_PAGE_DEFAULTS.width;
    const h = src.height || S.pageDims[pageId]?.height || BLANK_PAGE_DEFAULTS.height;
    S.pageDims[pageId] = { width: w, height: h };
    const vw = w * S.zoom, vh = h * S.zoom;
    canvas.width = vw;
    canvas.height = vh;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, vw, vh);
    ctx.strokeStyle = '#e2e8f0';
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(0.5, 0.5, vw - 1, vh - 1);
    ctx.setLineDash([]);
    const visual = getVisualPageDims(pageId);
    if (visual && surface) {
      wrapper.style.width = `${visual.width * S.zoom}px`;
      wrapper.style.height = `${visual.height * S.zoom}px`;
      surface.style.width = `${vw}px`;
      surface.style.height = `${vh}px`;
      surface.style.transform = rotationSurfaceTransform(rotation, vw, vh);
    }
    S.textItems[pageId] = [];
    const cur = renderTasks.get(pageId);
    if (cur && cur.token === token) renderTasks.delete(pageId);
    let svg = wrapper.querySelector('.ann-svg');
    if (!svg) {
      svg = createAnnotationSvg(pageId, vw, vh);
      (surface || wrapper).appendChild(svg);
    } else {
      svg.setAttribute('width', vw);
      svg.setAttribute('height', vh);
      renderAnnotationsSvg(svg, pageId);
    }
    renderDiffOverlay(wrapper, pageId, vw, vh);
    if (S.searchOpen && S.searchQuery && S.searchResults.length) {
      renderSearchOverlayForPage(pageId);
    }
    renderPageNumberOverlay(wrapper, pageId);
    return;
  }

  let page;
  try {
    page = await resolveSourcePageForId(pageId);
  } catch (err) {
    if (err?.name === 'RenderingCancelledException') return;
    if (isStale()) return;
    console.error(err);
    showToast('ページの読み込みに失敗しました', 'error');
    return;
  }
  if (!page || isStale()) return;

  const vp   = page.getViewport({ scale: S.zoom });
  canvas.width  = vp.width;
  canvas.height = vp.height;
  S.pageDims[pageId] = { width: page.getViewport({ scale: 1 }).width, height: page.getViewport({ scale: 1 }).height };
  const visual = getVisualPageDims(pageId);
  if (visual && surface) {
    wrapper.style.width = `${visual.width * S.zoom}px`;
    wrapper.style.height = `${visual.height * S.zoom}px`;
    surface.style.width = `${vp.width}px`;
    surface.style.height = `${vp.height}px`;
    surface.style.transform = rotationSurfaceTransform(rotation, vp.width, vp.height);
  }

  const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
  renderTasks.set(pageId, { task, token });
  let renderOk = false;
  try {
    await task.promise;
    renderOk = true;
  } catch (err) {
    if (err?.name === 'RenderingCancelledException') return;
    console.error(err);
    showToast('ページの描画に失敗しました', 'error');
    return;
  }

  if (!renderOk || isStale()) return;

  try {
    await loadTextItems(page, pageId, vp);
  } catch (err) {
    if (err?.name !== 'RenderingCancelledException') console.error(err);
  }

  if (isStale()) return;

  // 自分のトークンが最新ならエントリを掃除
  const cur = renderTasks.get(pageId);
  if (cur && cur.token === token) renderTasks.delete(pageId);

  page.cleanup();

  // SVG オーバーレイ
  let svg = wrapper.querySelector('.ann-svg');
  if (!svg) {
    svg = createAnnotationSvg(pageId, vp.width, vp.height);
    (surface || wrapper).appendChild(svg);
  } else {
    svg.setAttribute('width', vp.width);
    svg.setAttribute('height', vp.height);
    renderAnnotationsSvg(svg, pageId);
  }

  // 差分表示は注釈・本文編集位置を半透明矩形で重ねる。
  renderDiffOverlay(wrapper, pageId, vp.width, vp.height);

  // 検索結果は該当ページの表示後に重ねる。
  if (S.searchOpen && S.searchQuery && S.searchResults.length) {
    renderSearchOverlayForPage(pageId);
  }
  // ページ番号の位置調整用オーバーレイは保存結果と同じ座標へ変換する。
  renderPageNumberOverlay(wrapper, pageId);
}

// Before表示は未編集PDFだけを参照し、編集後のページ構成から分離する。
async function renderBeforePage(pageId, canvas, wrapper) {
  const surface = wrapper.querySelector('.page-surface');
  // wrapper のサイズ計算: 元PDFサイズ（編集の回転は反映しない）
  const src = getPageSource(pageId);
  // Before に対応するページが無い場合は不可表示
  if (!hasBeforeForPage(pageId)) {
    const w = (S.pageDims[pageId]?.width || BLANK_PAGE_DEFAULTS.width) * S.zoom;
    const h = (S.pageDims[pageId]?.height || BLANK_PAGE_DEFAULTS.height) * S.zoom;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#92400e';
    ctx.font = `${Math.max(14, 18 * (S.zoom / 1.5))}px -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = src.kind === 'blank' ? 'Before 対応なし（白紙ページ）'
      : src.kind === 'imported' ? 'Before 対応なし（結合ページ）'
      : src.kind === 'duplicate' && src.sourceKey ? 'Before 対応なし（結合の複製）'
      : 'Before を表示できません';
    ctx.fillText(label, w / 2, h / 2);
    if (surface) {
      wrapper.style.width = `${w}px`;
      wrapper.style.height = `${h}px`;
      surface.style.width = `${w}px`;
      surface.style.height = `${h}px`;
      surface.style.transform = 'none';
    }
    // SVG レイヤーは付与しない（注釈なし）
    return;
  }
  try {
    const page = await S.originalPdfDoc.getPage(src.sourceIndex + 1);
    const rotation = normalizeRotation(page.rotate || 0);
    const vp = page.getViewport({ scale: S.zoom, rotation });
    canvas.width = vp.width;
    canvas.height = vp.height;
    if (surface) {
      wrapper.style.width = `${vp.width}px`;
      wrapper.style.height = `${vp.height}px`;
      surface.style.width = `${vp.width}px`;
      surface.style.height = `${vp.height}px`;
      surface.style.transform = 'none';
    }
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    page.cleanup();
  } catch (err) {
    if (err?.name === 'RenderingCancelledException') return;
    console.error(err);
  }
}

// 差分ハイライトオーバーレイ
function renderDiffOverlay(wrapper, pageId, width, height) {
  // 既存のオーバーレイを除去
  const existing = wrapper.querySelector('.diff-overlay');
  if (existing) existing.remove();
  if (!S.compareDiff) return;
  const dims = S.pageDims[pageId];
  if (!dims) return;
  const surface = wrapper.querySelector('.page-surface');
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.classList.add('diff-overlay');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.style.pointerEvents = 'none';

  // 元PDF由来でないページ（白紙/結合）全体をハイライト
  const src = getPageSource(pageId);
  if (src.kind === 'blank' || src.kind === 'imported' || (src.kind === 'duplicate' && src.sourceKey)) {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', 0); rect.setAttribute('y', 0);
    rect.setAttribute('width', width); rect.setAttribute('height', height);
    rect.setAttribute('fill', 'rgba(56,161,105,.18)');
    rect.setAttribute('stroke', 'rgba(56,161,105,.6)');
    rect.setAttribute('stroke-width', '2');
    rect.setAttribute('stroke-dasharray', '6,4');
    svg.appendChild(rect);
  }
  // 回転を加えたページにもバッジ的にハイライト
  if (getPageRotation(pageId) !== 0) {
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', 0); rect.setAttribute('y', 0);
    rect.setAttribute('width', width); rect.setAttribute('height', height);
    rect.setAttribute('fill', 'none');
    rect.setAttribute('stroke', 'rgba(221,107,32,.7)');
    rect.setAttribute('stroke-width', '3');
    svg.appendChild(rect);
  }

  // 注釈位置
  for (const ann of S.annotations.filter((a) => a.pageIndex === pageId)) {
    const cr = pdfRectToCanvas(ann.rect, dims, S.zoom);
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', cr.x - 2); rect.setAttribute('y', cr.y - 2);
    rect.setAttribute('width', cr.width + 4); rect.setAttribute('height', cr.height + 4);
    if (ann.type === 'textedit') {
      rect.setAttribute('fill', 'rgba(246,173,85,.28)');
      rect.setAttribute('stroke', 'rgba(246,173,85,.9)');
    } else {
      rect.setAttribute('fill', 'rgba(66,153,225,.18)');
      rect.setAttribute('stroke', 'rgba(66,153,225,.8)');
    }
    rect.setAttribute('stroke-width', '1.5');
    rect.setAttribute('stroke-dasharray', '4,3');
    svg.appendChild(rect);
  }

  (surface || wrapper).appendChild(svg);
}

async function loadTextItems(page, pageId, viewport) {
  const dims = S.pageDims[pageId];
  if (!dims) return;

  const content = await page.getTextContent();
  S.textItems[pageId] = content.items
    .map((item, idx) => {
      const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
      const fontHeight = Math.max(6, Math.hypot(tx[2], tx[3]));
      const width = Math.max(6, item.width * S.zoom);
      const x = tx[4];
      const y = tx[5] - fontHeight;
      const rect = canvasRectToPdf(x, y, x + width, y + fontHeight * 1.15, dims, S.zoom);
      return {
        id: `t${pageId}_${idx}`,
        pageIndex: pageId,
        text: item.str,
        rect,
        fontSize: Math.max(8, fontHeight / S.zoom),
      };
    })
    .filter((item) => item.text && item.text.trim() && item.rect.width > 2 && item.rect.height > 2);
}

// 注釈SVGレイヤー。PDF座標の注釈を画面座標へ変換して操作する。

// 描画中の一時状態（グローバル、ページをまたがないので問題なし）
const draw = {
  active:    false,
  pageIndex: -1,
  pageDims:  null,
  zoom:      1,
  start:     { x: 0, y: 0 },
  current:   { x: 0, y: 0 },
  inkPoints: [],
  previewEl: null,  // SVG element for preview
  svgEl:     null,
};

// 移動ドラッグ状態
const drag = {
  active:  false,
  annId:   null,
  ids:     [],     // 一括移動対象
  origin:  { x: 0, y: 0 },
  moved:   false,  // 実際に動いたか（履歴に積むかの判定）
};

// リサイズドラッグ状態
const resize = {
  active:   false,
  annId:    null,
  handle:   null,  // 'nw'|'n'|'ne'|'w'|'e'|'sw'|'s'|'se'|'start'|'end'
  pageIndex: -1,
  origRect: null,
  origStart: null,
  origEnd:  null,
  origInkLists: null,
  origRectForInk: null,
  svgEl:    null,
};

// マーキー（範囲）選択状態
const marquee = {
  active:    false,
  pageIndex: -1,
  start:     { x: 0, y: 0 },
  current:   { x: 0, y: 0 },
  svgEl:     null,
  el:        null,
  additive:  false,
  baseSelection: [],
};

function createAnnotationSvg(pageIndex, w, h) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.classList.add('ann-svg');
  svg.dataset.page = pageIndex;

  renderAnnotationsSvg(svg, pageIndex);
  attachSvgEvents(svg, pageIndex);
  return svg;
}

function attachSvgEvents(svg, pageIndex) {
  // ハンドル / 注釈クリック / マーキー / 描画 の順で優先処理する
  svg.addEventListener('pointerdown', (e) => {
    if (S.activeTool === 'textedit') {
      handleTextEditClick(e, svg, pageIndex);
      return;
    }
    if (S.activeTool === 'select') {
      // リサイズハンドル
      const handleEl = e.target.closest('[data-resize-handle]');
      if (handleEl) {
        e.preventDefault();
        e.stopPropagation();
        startResize(e, svg, pageIndex, handleEl.dataset.resizeHandle, handleEl.dataset.annId);
        return;
      }
      // 注釈クリック
      const annEl = e.target.closest('[data-ann-id]');
      if (annEl) {
        e.preventDefault();
        e.stopPropagation();
        handleAnnotationClick(e, svg, pageIndex, annEl.dataset.annId);
        return;
      }
      // 空白 → マーキー選択開始
      handleSelectClick(e, svg, pageIndex);
      return;
    }
    e.preventDefault();
    svg.setPointerCapture(e.pointerId);
    const pos = svgXY(e, svg);
    draw.active    = true;
    draw.pageIndex = pageIndex;
    draw.pageDims  = S.pageDims[pageIndex];
    draw.zoom      = S.zoom;
    draw.start     = pos;
    draw.current   = pos;
    draw.svgEl     = svg;
    if (S.activeTool === 'ink') draw.inkPoints = [pos];
    else draw.inkPoints = [];
  });

  svg.addEventListener('pointermove', (e) => {
    // リサイズ中
    if (resize.active && resize.pageIndex === pageIndex) {
      updateResize(e, svg);
      return;
    }
    // 移動ドラッグ中
    if (drag.active) {
      const pos = svgXY(e, svg);
      const dx  = (pos.x - drag.origin.x) / S.zoom;
      const dy  = (pos.y - drag.origin.y) / S.zoom;
      drag.origin = pos;
      if (dx !== 0 || dy !== 0) drag.moved = true;
      for (const id of drag.ids) {
        const ann = S.annotations.find((a) => a.id === id);
        if (ann) moveAnnotation(ann, dx, -dy);
      }
      renderAnnotationsSvg(svg, pageIndex);
      return;
    }
    // マーキー中
    if (marquee.active && marquee.pageIndex === pageIndex) {
      marquee.current = svgXY(e, svg);
      updateMarquee(svg, pageIndex);
      return;
    }
    if (!draw.active || draw.pageIndex !== pageIndex) return;
    draw.current = svgXY(e, svg);
    if (S.activeTool === 'ink') draw.inkPoints.push(draw.current);
    renderPreview(svg);
  });

  svg.addEventListener('pointerup', (e) => {
    if (resize.active && resize.pageIndex === pageIndex) {
      endResize(svg);
      return;
    }
    if (drag.active) {
      drag.active = false;
      if (drag.moved) {
        pushHistory();
        updateUndoRedo();
      }
      drag.moved = false;
      drag.ids = [];
      return;
    }
    if (marquee.active && marquee.pageIndex === pageIndex) {
      endMarquee(svg, pageIndex);
      return;
    }
    if (!draw.active || draw.pageIndex !== pageIndex) return;
    draw.active = false;
    draw.current = svgXY(e, svg);
    if (draw.previewEl) { draw.previewEl.remove(); draw.previewEl = null; }
    commitDrawing(pageIndex);
  });

  svg.addEventListener('pointercancel', () => {
    if (resize.active) endResize(svg);
    if (drag.active) {
      drag.active = false;
      drag.ids = [];
      drag.moved = false;
    }
    if (marquee.active) endMarquee(svg, pageIndex, true);
  });
}

// Shift/Ctrlを押した注釈クリックでは選択集合を維持する。
function handleAnnotationClick(e, svg, pageIndex, annId) {
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  if (additive) {
    if (S.selectedAnnIds.includes(annId)) {
      setSelectedAnnIds(S.selectedAnnIds.filter((x) => x !== annId));
    } else {
      setSelectedAnnIds([...S.selectedAnnIds, annId]);
    }
  } else if (!S.selectedAnnIds.includes(annId)) {
    // 既に選択中の要素でない場合のみ選択を置き換える
    setSelectedAnnIds([annId]);
  }
  // 移動ドラッグ準備（選択集合全体を移動）
  try { svg.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  drag.active = true;
  drag.annId = annId;
  drag.ids = S.selectedAnnIds.length ? S.selectedAnnIds.slice() : [annId];
  drag.origin = svgXY(e, svg);
  drag.moved = false;
  renderAnnotationsSvg(svg, pageIndex);
  updateOptionsPanel();
}

function svgXY(e, svg) {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function handleSelectClick(e, svg, pageIndex) {
  const dims = S.pageDims[pageIndex];
  if (!dims) return;
  e.preventDefault();
  // 空白でクリック → 選択解除＋マーキー開始
  try { svg.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  const additive = e.shiftKey || e.ctrlKey || e.metaKey;
  marquee.active = true;
  marquee.pageIndex = pageIndex;
  marquee.start = svgXY(e, svg);
  marquee.current = marquee.start;
  marquee.svgEl = svg;
  marquee.additive = additive;
  marquee.baseSelection = additive ? S.selectedAnnIds.slice() : [];
  if (!additive) {
    setSelectedAnnIds([]);
    renderAnnotationsSvg(svg, pageIndex);
    updateOptionsPanel();
  }
}

function updateMarquee(svg, pageIndex) {
  const ns = 'http://www.w3.org/2000/svg';
  const s = marquee.start, c = marquee.current;
  const x = Math.min(s.x, c.x), y = Math.min(s.y, c.y);
  const w = Math.abs(c.x - s.x), h = Math.abs(c.y - s.y);
  if (!marquee.el) {
    marquee.el = document.createElementNS(ns, 'rect');
    marquee.el.setAttribute('class', 'marquee-rect');
    marquee.el.setAttribute('fill', 'rgba(66,153,225,0.12)');
    marquee.el.setAttribute('stroke', '#3182ce');
    marquee.el.setAttribute('stroke-width', '1');
    marquee.el.setAttribute('stroke-dasharray', '4,3');
    marquee.el.setAttribute('pointer-events', 'none');
    svg.appendChild(marquee.el);
  }
  marquee.el.setAttribute('x', x);
  marquee.el.setAttribute('y', y);
  marquee.el.setAttribute('width', w);
  marquee.el.setAttribute('height', h);
}

function endMarquee(svg, pageIndex, cancel = false) {
  if (marquee.el) { marquee.el.remove(); marquee.el = null; }
  const s = marquee.start, c = marquee.current;
  const minX = Math.min(s.x, c.x), maxX = Math.max(s.x, c.x);
  const minY = Math.min(s.y, c.y), maxY = Math.max(s.y, c.y);
  const dragged = (maxX - minX) > 3 || (maxY - minY) > 3;
  marquee.active = false;
  if (cancel || !dragged) {
    // 単なるクリック扱い: 何も追加せず終了（既に選択は空に）
    renderAnnotationsSvg(svg, pageIndex);
    updateOptionsPanel();
    return;
  }
  const dims = S.pageDims[pageIndex];
  if (!dims) return;
  const hits = S.annotations
    .filter((a) => a.pageIndex === pageIndex)
    .filter((a) => {
      const cr = pdfRectToCanvas(a.rect, dims, S.zoom);
      // マーキー領域と注釈バウンディング矩形が重なれば選択
      return cr.x + cr.width >= minX && cr.x <= maxX && cr.y + cr.height >= minY && cr.y <= maxY;
    })
    .map((a) => a.id);
  const next = marquee.additive
    ? Array.from(new Set([...marquee.baseSelection, ...hits]))
    : hits;
  setSelectedAnnIds(next);
  renderAnnotationsSvg(svg, pageIndex);
  updateOptionsPanel();
}

// 注釈のリサイズ
function startResize(e, svg, pageIndex, handle, annId) {
  const ann = S.annotations.find((a) => a.id === annId);
  if (!ann) return;
  try { svg.setPointerCapture(e.pointerId); } catch (_) { /* noop */ }
  resize.active = true;
  resize.annId = annId;
  resize.handle = handle;
  resize.pageIndex = pageIndex;
  resize.svgEl = svg;
  resize.origRect = { ...ann.rect };
  resize.origStart = ann.startPoint ? { ...ann.startPoint } : null;
  resize.origEnd = ann.endPoint ? { ...ann.endPoint } : null;
  resize.origInkLists = ann.inkLists ? ann.inkLists.map((s) => s.map((p) => ({ ...p }))) : null;
  resize.origRectForInk = ann.inkLists ? { ...ann.rect } : null;
  resize.startPointer = svgXY(e, svg);
}

function updateResize(e, svg) {
  const ann = S.annotations.find((a) => a.id === resize.annId);
  const dims = S.pageDims[resize.pageIndex];
  if (!ann || !dims) return;
  const pos = svgXY(e, svg);

  // 線・矢印: 端点リサイズ
  if ((ann.type === 'line' || ann.type === 'arrow') && (resize.handle === 'start' || resize.handle === 'end')) {
    const pdf = canvasToPdf(pos.x, pos.y, dims, S.zoom);
    if (resize.handle === 'start') ann.startPoint = pdf;
    else ann.endPoint = pdf;
    const xs = [ann.startPoint.x, ann.endPoint.x];
    const ys = [ann.startPoint.y, ann.endPoint.y];
    ann.rect = { x: Math.min(...xs), y: Math.min(...ys), width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) };
    renderAnnotationsSvg(svg, resize.pageIndex);
    return;
  }

  // バウンディングボックスリサイズ
  const orig = resize.origRect;
  // PDF座標: y は下端、PDF height = top-bottom
  // canvas 座標で扱いやすくするため canvas 上のバウンディングへ変換
  const cr0 = pdfRectToCanvas(orig, dims, S.zoom);
  let nx = cr0.x, ny = cr0.y, nw = cr0.width, nh = cr0.height;
  const h = resize.handle;
  if (h.includes('w')) { nw = cr0.x + cr0.width - pos.x; nx = pos.x; }
  if (h.includes('e')) { nw = pos.x - cr0.x; }
  if (h.includes('n')) { nh = cr0.y + cr0.height - pos.y; ny = pos.y; }
  if (h.includes('s')) { nh = pos.y - cr0.y; }
  // 最小サイズ確保（反転を防ぐ）
  const MIN = 6;
  if (nw < MIN) {
    if (h.includes('w')) nx = cr0.x + cr0.width - MIN;
    nw = MIN;
  }
  if (nh < MIN) {
    if (h.includes('n')) ny = cr0.y + cr0.height - MIN;
    nh = MIN;
  }
  // PDF 座標に戻す
  const newRect = canvasRectToPdf(nx, ny, nx + nw, ny + nh, dims, S.zoom);

  // ink: 全パスをスケール
  if (ann.inkLists && resize.origInkLists && resize.origRectForInk) {
    const o = resize.origRectForInk;
    const sx = o.width > 0 ? newRect.width / o.width : 1;
    const sy = o.height > 0 ? newRect.height / o.height : 1;
    ann.inkLists = resize.origInkLists.map((stroke) => stroke.map((p) => ({
      x: newRect.x + (p.x - o.x) * sx,
      y: newRect.y + (p.y - o.y) * sy,
    })));
  }
  ann.rect = newRect;
  renderAnnotationsSvg(svg, resize.pageIndex);
}

function endResize(svg) {
  if (!resize.active) return;
  resize.active = false;
  pushHistory();
  updateUndoRedo();
  renderAnnotationsSvg(svg, resize.pageIndex);
  resize.annId = null;
  resize.handle = null;
}

function handleTextEditClick(e, svg, pageIndex) {
  e.preventDefault();
  const dims = S.pageDims[pageIndex];
  if (!dims) return;

  const target = e.target.closest('[data-text-item-id]');
  let item = null;
  if (target) {
    item = S.textItems[pageIndex]?.find((t) => t.id === target.dataset.textItemId);
  } else {
    const annTarget = e.target.closest('[data-ann-id]');
    const existing = annTarget ? S.annotations.find((a) => a.id === annTarget.dataset.annId && a.type === 'textedit') : null;
    if (existing) {
      setSelectedAnnIds([existing.id]);
      renderAnnotationsSvg(svg, pageIndex);
      updateOptionsPanel();
      setTimeout(() => beginTextEdit(existing.id, pageIndex), 20);
      return;
    }
    const pos = svgXY(e, svg);
    item = (S.textItems[pageIndex] || []).find((t) => hitTest(pos.x, pos.y, pdfRectToCanvas(t.rect, dims, S.zoom), 2));
  }
  if (!item) return;

  let ann = S.annotations.find((a) => a.type === 'textedit' && a.sourceId === item.id);
  if (!ann) {
    // 文字編集の背景色は、クリック周辺のページCanvasから推定する。
    const autoBg = sampleBackgroundColor(pageIndex, item.rect) || S.toolOptions.editBgColor;
    ann = {
      id: genId(),
      type: 'textedit',
      pageIndex,
      sourceId: item.id,
      rect: { ...item.rect },
      originalText: item.text,
      text: item.text,
      color: '#1a202c',
      fontColor: S.toolOptions.fontColor,
      fontSize: item.fontSize,
      bgColor: autoBg,
      opacity: 1,
    };
    addAnnotation(ann);
  }

  setSelectedAnnIds([ann.id]);
  renderAnnotationsSvg(svg, pageIndex);
  updateOptionsPanel();
  setTimeout(() => beginTextEdit(ann.id, pageIndex), 20);
}

// クリック位置周辺から、文字を避けて背景色を推定する。
// rect は PDF 座標。注釈の上端 / 左外 / 右外 / 下端 の数点を平均する。
function sampleBackgroundColor(pageIndex, rect) {
  try {
    const dims = S.pageDims[pageIndex];
    if (!dims || !rect) return null;
    const wrapper = document.querySelector(`.page-wrapper${pageDataSelector(pageIndex)}`);
    if (!wrapper) return null;
    const canvas = wrapper.querySelector('canvas');
    if (!canvas || !canvas.width || !canvas.height) return null;
    const cr = pdfRectToCanvas(rect, dims, S.zoom);
    // 注釈の周囲数点をサンプリング（テキスト本体は避けるため上下端の外側寄り）
    const samples = [
      { x: cr.x + cr.width * 0.5, y: cr.y - 3 },
      { x: cr.x + cr.width * 0.5, y: cr.y + cr.height + 3 },
      { x: cr.x - 3,              y: cr.y + cr.height * 0.5 },
      { x: cr.x + cr.width + 3,   y: cr.y + cr.height * 0.5 },
      { x: cr.x + cr.width * 0.25, y: cr.y - 3 },
      { x: cr.x + cr.width * 0.75, y: cr.y - 3 },
    ];
    const ctx = canvas.getContext('2d');
    let r = 0, g = 0, b = 0, n = 0;
    for (const s of samples) {
      const sx = Math.max(0, Math.min(canvas.width - 1, Math.round(s.x)));
      const sy = Math.max(0, Math.min(canvas.height - 1, Math.round(s.y)));
      const data = ctx.getImageData(sx, sy, 1, 1).data;
      // 透過ピクセルは無視
      if (data[3] < 8) continue;
      r += data[0]; g += data[1]; b += data[2]; n += 1;
    }
    if (!n) return null;
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    // 白に近ければ純白に丸める
    if (r >= 240 && g >= 240 && b >= 240) return '#ffffff';
    const hex = (v) => v.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  } catch (_) {
    return null;
  }
}

function moveAnnotation(ann, dx, dy) {
  ann.rect = { ...ann.rect, x: ann.rect.x + dx, y: ann.rect.y + dy };
  if (ann.startPoint) ann.startPoint = { x: ann.startPoint.x + dx, y: ann.startPoint.y + dy };
  if (ann.endPoint) ann.endPoint = { x: ann.endPoint.x + dx, y: ann.endPoint.y + dy };
  if (ann.inkLists) {
    ann.inkLists = ann.inkLists.map((stroke) => stroke.map((p) => ({ x: p.x + dx, y: p.y + dy })));
  }
}

function commitDrawing(pageIndex) {
  const dims = draw.pageDims;
  const zoom = draw.zoom;
  const { start: s, current: c } = draw;
  const dx = c.x - s.x, dy = c.y - s.y;
  const tooSmall = Math.abs(dx) < 4 && Math.abs(dy) < 4;

  if (S.activeTool === 'ink') {
    if (draw.inkPoints.length < 2) return;
    const pts = draw.inkPoints.map((p) => canvasToPdf(p.x, p.y, dims, zoom));
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    addAnnotation({
      id: genId(), type: 'ink', pageIndex,
      rect: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) },
      color: S.toolOptions.color, opacity: S.toolOptions.opacity,
      inkLists: [pts], strokeWidth: S.toolOptions.strokeWidth,
    });
    return;
  }

  if (tooSmall && S.activeTool !== 'freetext') return;

  const rect = canvasRectToPdf(s.x, s.y, c.x, c.y, dims, zoom);
  const base = { id: genId(), pageIndex, rect, color: S.toolOptions.color, opacity: S.toolOptions.opacity };

  switch (S.activeTool) {
    case 'rectangle':
      addAnnotation({ ...base, type: 'rectangle', fillColor: S.toolOptions.fillColor, strokeWidth: S.toolOptions.strokeWidth });
      break;
    case 'circle':
      addAnnotation({ ...base, type: 'circle', fillColor: S.toolOptions.fillColor, strokeWidth: S.toolOptions.strokeWidth });
      break;
    case 'line': {
      const sp = canvasToPdf(s.x, s.y, dims, zoom), ep = canvasToPdf(c.x, c.y, dims, zoom);
      addAnnotation({ ...base, type: 'line', startPoint: sp, endPoint: ep, strokeWidth: S.toolOptions.strokeWidth });
      break;
    }
    case 'arrow': {
      const sp = canvasToPdf(s.x, s.y, dims, zoom), ep = canvasToPdf(c.x, c.y, dims, zoom);
      addAnnotation({ ...base, type: 'arrow', startPoint: sp, endPoint: ep, strokeWidth: S.toolOptions.strokeWidth });
      break;
    }
    case 'highlight':
      addAnnotation({ ...base, type: 'highlight', color: S.toolOptions.color, opacity: Math.min(S.toolOptions.opacity, 0.4) });
      break;
    case 'redaction':
      // 墨消し: 注釈として配置（保存時に黒で焼き込む）
      addAnnotation({ ...base, type: 'redaction', color: '#000000', opacity: 1 });
      break;
    case 'freetext': {
      // ドラッグサイズがあればそのサイズで、無ければデフォルト
      const haveDrag = !tooSmall;
      const pdfStart = canvasToPdf(s.x, s.y, dims, zoom);
      const newId = genId();
      let r;
      if (haveDrag) {
        r = canvasRectToPdf(s.x, s.y, c.x, c.y, dims, zoom);
        // 文字が読める最低の高さを確保
        const minH = Math.max(30/zoom, S.toolOptions.fontSize * 1.4);
        if (r.height < minH) r = { ...r, height: minH, y: r.y - (minH - r.height) };
      } else {
        r = { x: pdfStart.x, y: pdfStart.y - 30/zoom, width: 200/zoom, height: 30/zoom };
      }
      addAnnotation({ ...base, id: newId, rect: r, type: 'freetext',
        text: '', fontSize: S.toolOptions.fontSize, fontColor: S.toolOptions.fontColor,
      });
      setSelectedAnnIds([newId]);
      // テキスト入力を起動
      setTimeout(() => beginTextEdit(newId, pageIndex), 50);
      break;
    }
  }
}

function renderPreview(svg) {
  if (draw.previewEl) draw.previewEl.remove();
  draw.previewEl = null;

  const { start: s, current: c } = draw;
  const x = Math.min(s.x, c.x), y = Math.min(s.y, c.y);
  const w = Math.abs(c.x - s.x), h = Math.abs(c.y - s.y);
  const color = S.toolOptions.color;
  const sw    = S.toolOptions.strokeWidth;
  const ns    = 'http://www.w3.org/2000/svg';

  let el = null;
  switch (S.activeTool) {
    case 'rectangle':
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('width', w); el.setAttribute('height', h);
      el.setAttribute('fill', 'none'); el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
      break;
    case 'circle':
      el = document.createElementNS(ns, 'ellipse');
      el.setAttribute('cx', x+w/2); el.setAttribute('cy', y+h/2); el.setAttribute('rx', w/2); el.setAttribute('ry', h/2);
      el.setAttribute('fill', 'none'); el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
      break;
    case 'line': case 'arrow':
      el = document.createElementNS(ns, 'line');
      el.setAttribute('x1', s.x); el.setAttribute('y1', s.y); el.setAttribute('x2', c.x); el.setAttribute('y2', c.y);
      el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
      break;
    case 'highlight':
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('width', w); el.setAttribute('height', h);
      el.setAttribute('fill', color); el.setAttribute('opacity', '0.3');
      break;
    case 'redaction':
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('width', w); el.setAttribute('height', h);
      el.setAttribute('fill', '#000000'); el.setAttribute('opacity', '0.78');
      break;
    case 'ink':
      if (draw.inkPoints.length < 2) return;
      el = document.createElementNS(ns, 'polyline');
      el.setAttribute('points', draw.inkPoints.map((p) => `${p.x},${p.y}`).join(' '));
      el.setAttribute('fill', 'none'); el.setAttribute('stroke', color); el.setAttribute('stroke-width', sw);
      el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round');
      break;
    case 'freetext':
      el = document.createElementNS(ns, 'rect');
      el.setAttribute('x', x); el.setAttribute('y', y); el.setAttribute('width', w); el.setAttribute('height', h);
      el.setAttribute('fill', 'none'); el.setAttribute('stroke', color);
      el.setAttribute('stroke-width', 1); el.setAttribute('stroke-dasharray', '4,3');
      break;
  }
  if (el) {
    el.style.opacity  = '0.6';
    el.style.pointerEvents = 'none';
    svg.appendChild(el);
    draw.previewEl = el;
  }
}

function renderAnnotationsSvg(svg, pageIndex) {
  svg.innerHTML = '';
  const dims = S.pageDims[pageIndex];
  if (!dims) return;
  const zoom = S.zoom;
  const ns   = 'http://www.w3.org/2000/svg';

  // カーソル
  const cursor =
    S.activeTool === 'select'   ? 'default' :
    ['freetext','textedit'].includes(S.activeTool) ? 'text' :
    S.activeTool === 'redaction' ? 'crosshair' : 'crosshair';
  svg.style.cursor = cursor;

  renderTextEditTargets(svg, pageIndex, dims, zoom, ns);

  const anns = S.annotations.filter((a) => a.pageIndex === pageIndex);

  const multiCount = S.selectedAnnIds.length;
  const isPrimary = (id) => id === S.selectedId;
  const isSelected = (id) => S.selectedAnnIds.includes(id) || id === S.selectedId;

  for (const ann of anns) {
    const g   = document.createElementNS(ns, 'g');
    g.dataset.annId = ann.id;
    const cr  = pdfRectToCanvas(ann.rect, dims, zoom);
    const sel = isSelected(ann.id);

    let shape = null;

    switch (ann.type) {
      case 'rectangle': {
        shape = document.createElementNS(ns, 'rect');
        shape.setAttribute('x', cr.x); shape.setAttribute('y', cr.y);
        shape.setAttribute('width', cr.width); shape.setAttribute('height', cr.height);
        shape.setAttribute('fill', ann.fillColor ?? 'none');
        shape.setAttribute('stroke', ann.color); shape.setAttribute('stroke-width', ann.strokeWidth);
        shape.setAttribute('opacity', ann.opacity);
        break;
      }
      case 'circle': {
        shape = document.createElementNS(ns, 'ellipse');
        shape.setAttribute('cx', cr.x + cr.width/2); shape.setAttribute('cy', cr.y + cr.height/2);
        shape.setAttribute('rx', cr.width/2); shape.setAttribute('ry', cr.height/2);
        shape.setAttribute('fill', ann.fillColor ?? 'none');
        shape.setAttribute('stroke', ann.color); shape.setAttribute('stroke-width', ann.strokeWidth);
        shape.setAttribute('opacity', ann.opacity);
        break;
      }
      case 'line': {
        shape = document.createElementNS(ns, 'line');
        const sp = pdfToCanvas(ann.startPoint.x, ann.startPoint.y, dims, zoom);
        const ep = pdfToCanvas(ann.endPoint.x, ann.endPoint.y, dims, zoom);
        shape.setAttribute('x1', sp.x); shape.setAttribute('y1', sp.y);
        shape.setAttribute('x2', ep.x); shape.setAttribute('y2', ep.y);
        shape.setAttribute('stroke', ann.color); shape.setAttribute('stroke-width', ann.strokeWidth);
        shape.setAttribute('opacity', ann.opacity);
        // 当たり判定用の太い透明線
        const hitLine = document.createElementNS(ns, 'line');
        hitLine.setAttribute('x1', sp.x); hitLine.setAttribute('y1', sp.y);
        hitLine.setAttribute('x2', ep.x); hitLine.setAttribute('y2', ep.y);
        hitLine.setAttribute('stroke', 'transparent'); hitLine.setAttribute('stroke-width', Math.max(ann.strokeWidth + 8, 12));
        g.appendChild(hitLine);
        break;
      }
      case 'arrow': {
        const sp = pdfToCanvas(ann.startPoint.x, ann.startPoint.y, dims, zoom);
        const ep = pdfToCanvas(ann.endPoint.x, ann.endPoint.y, dims, zoom);
        shape = document.createElementNS(ns, 'g');
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', sp.x); line.setAttribute('y1', sp.y);
        line.setAttribute('x2', ep.x); line.setAttribute('y2', ep.y);
        line.setAttribute('stroke', ann.color); line.setAttribute('stroke-width', ann.strokeWidth);
        line.setAttribute('opacity', ann.opacity);
        shape.appendChild(line);
        const dx = ep.x-sp.x, dy = ep.y-sp.y, len = Math.sqrt(dx*dx+dy*dy);
        if (len > 1) {
          const as = Math.max(ann.strokeWidth*4, 10), nx = dx/len, ny = dy/len, px = -ny, py = nx;
          const head = document.createElementNS(ns, 'polygon');
          head.setAttribute('points', [
            `${ep.x},${ep.y}`,
            `${ep.x-nx*as+px*as/2},${ep.y-ny*as+py*as/2}`,
            `${ep.x-nx*as-px*as/2},${ep.y-ny*as-py*as/2}`,
          ].join(' '));
          head.setAttribute('fill', ann.color); head.setAttribute('opacity', ann.opacity);
          shape.appendChild(head);
        }
        // 当たり判定
        const hitRect = document.createElementNS(ns, 'rect');
        hitRect.setAttribute('x', cr.x); hitRect.setAttribute('y', cr.y);
        hitRect.setAttribute('width', cr.width); hitRect.setAttribute('height', cr.height);
        hitRect.setAttribute('fill', 'transparent');
        shape.appendChild(hitRect);
        break;
      }
      case 'ink': {
        shape = document.createElementNS(ns, 'path');
        const d = ann.inkLists.map((stroke) => {
          if (stroke.length < 2) return '';
          const pts = stroke.map((p) => pdfToCanvas(p.x, p.y, dims, zoom));
          return 'M ' + pts.map((p) => `${p.x} ${p.y}`).join(' L ');
        }).join(' ');
        shape.setAttribute('d', d); shape.setAttribute('fill', 'none');
        shape.setAttribute('stroke', ann.color); shape.setAttribute('stroke-width', ann.strokeWidth);
        shape.setAttribute('stroke-linecap', 'round'); shape.setAttribute('stroke-linejoin', 'round');
        shape.setAttribute('opacity', ann.opacity);
        break;
      }
      case 'freetext': {
        shape = document.createElementNS(ns, 'g');
        const bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('x', cr.x); bg.setAttribute('y', cr.y);
        bg.setAttribute('width', Math.max(cr.width, 40)); bg.setAttribute('height', Math.max(cr.height, 20));
        bg.setAttribute('fill', 'transparent');
        shape.appendChild(bg);
        appendMultilineText(shape, ns, ann, cr, zoom, ann.text || '(ダブルクリックで編集)', pageIndex);
        break;
      }
      case 'textedit': {
        shape = document.createElementNS(ns, 'g');
        const bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('x', cr.x - 1); bg.setAttribute('y', cr.y - 1);
        bg.setAttribute('width', cr.width + 2); bg.setAttribute('height', cr.height + 2);
        bg.setAttribute('fill', ann.bgColor || '#ffffff');
        bg.setAttribute('stroke', sel ? '#3182ce' : '#f6ad55');
        bg.setAttribute('stroke-width', sel ? 1.5 : 0.75);
        shape.appendChild(bg);
        appendMultilineText(shape, ns, ann, cr, zoom, ann.text || '', pageIndex);
        break;
      }
      case 'highlight': {
        shape = document.createElementNS(ns, 'rect');
        shape.setAttribute('x', cr.x); shape.setAttribute('y', cr.y);
        shape.setAttribute('width', cr.width); shape.setAttribute('height', cr.height);
        shape.setAttribute('fill', ann.color); shape.setAttribute('opacity', ann.opacity);
        break;
      }
      case 'redaction': {
        shape = document.createElementNS(ns, 'g');
        const rectEl = document.createElementNS(ns, 'rect');
        rectEl.setAttribute('x', cr.x); rectEl.setAttribute('y', cr.y);
        rectEl.setAttribute('width', cr.width); rectEl.setAttribute('height', cr.height);
        rectEl.setAttribute('class', 'redaction-shape');
        shape.appendChild(rectEl);
        // 編集中の確認用に右下に小さな白い斜線（保存時は完全な黒）
        const stripeH = Math.max(3, Math.min(8, cr.height * 0.18));
        const stripe = document.createElementNS(ns, 'rect');
        stripe.setAttribute('x', cr.x);
        stripe.setAttribute('y', cr.y + cr.height - stripeH);
        stripe.setAttribute('width', cr.width);
        stripe.setAttribute('height', stripeH);
        stripe.setAttribute('class', 'redaction-stripe');
        shape.appendChild(stripe);
        break;
      }
      case 'image':
      case 'signature': {
        shape = document.createElementNS(ns, 'g');
        if (ann.src) {
          const img = document.createElementNS(ns, 'image');
          img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', ann.src);
          img.setAttribute('href', ann.src);
          img.setAttribute('x', cr.x); img.setAttribute('y', cr.y);
          img.setAttribute('width', cr.width); img.setAttribute('height', cr.height);
          img.setAttribute('opacity', ann.opacity ?? 1);
          img.setAttribute('preserveAspectRatio', 'none');
          shape.appendChild(img);
        }
        // 当たり判定用の透明矩形
        const hit = document.createElementNS(ns, 'rect');
        hit.setAttribute('x', cr.x); hit.setAttribute('y', cr.y);
        hit.setAttribute('width', cr.width); hit.setAttribute('height', cr.height);
        hit.setAttribute('fill', 'transparent');
        shape.appendChild(hit);
        break;
      }
      case 'stamp': {
        shape = document.createElementNS(ns, 'g');
        const sw = ann.strokeWidth ?? 2;
        const bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('x', cr.x); bg.setAttribute('y', cr.y);
        bg.setAttribute('width', cr.width); bg.setAttribute('height', cr.height);
        bg.setAttribute('fill', 'rgba(255,255,255,0.92)');
        if (sw > 0 && ann.borderColor) {
          bg.setAttribute('stroke', ann.borderColor);
          bg.setAttribute('stroke-width', sw);
        }
        shape.appendChild(bg);
        const txt = document.createElementNS(ns, 'text');
        txt.setAttribute('x', cr.x + cr.width / 2);
        txt.setAttribute('y', cr.y + cr.height / 2);
        txt.setAttribute('font-size', (ann.fontSize || 24) * zoom);
        txt.setAttribute('font-weight', 'bold');
        txt.setAttribute('fill', ann.color || '#e53e3e');
        txt.setAttribute('text-anchor', 'middle');
        txt.setAttribute('dominant-baseline', 'middle');
        txt.setAttribute('opacity', ann.opacity ?? 1);
        txt.style.userSelect = 'none';
        txt.style.pointerEvents = 'none';
        txt.textContent = ann.text || '';
        shape.appendChild(txt);
        break;
      }
      case 'qrcode': {
        shape = document.createElementNS(ns, 'g');
        // 背景
        const bg = document.createElementNS(ns, 'rect');
        bg.setAttribute('x', cr.x); bg.setAttribute('y', cr.y);
        bg.setAttribute('width', cr.width); bg.setAttribute('height', cr.height);
        bg.setAttribute('fill', ann.bgColor || '#ffffff');
        shape.appendChild(bg);
        // モジュール描画（キャッシュがあれば使う）
        const qr = ensureQrModules(ann);
        if (qr) {
          const cell = Math.min(cr.width, cr.height) / qr.size;
          for (let row = 0; row < qr.size; row++) {
            for (let col = 0; col < qr.size; col++) {
              if (!qr.modules[row][col]) continue;
              const rectEl = document.createElementNS(ns, 'rect');
              rectEl.setAttribute('x', cr.x + col * cell);
              rectEl.setAttribute('y', cr.y + row * cell);
              rectEl.setAttribute('width', cell);
              rectEl.setAttribute('height', cell);
              rectEl.setAttribute('fill', ann.fgColor || '#000000');
              shape.appendChild(rectEl);
            }
          }
        }
        // 当たり判定
        const hit = document.createElementNS(ns, 'rect');
        hit.setAttribute('x', cr.x); hit.setAttribute('y', cr.y);
        hit.setAttribute('width', cr.width); hit.setAttribute('height', cr.height);
        hit.setAttribute('fill', 'transparent');
        shape.appendChild(hit);
        break;
      }
    }

    if (shape) g.appendChild(shape);

    // 選択インジケーター
    if (sel) {
      const outline = document.createElementNS(ns, 'rect');
      outline.setAttribute('x', cr.x-2); outline.setAttribute('y', cr.y-2);
      outline.setAttribute('width', cr.width+4); outline.setAttribute('height', cr.height+4);
      outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', '#3182ce');
      outline.setAttribute('stroke-width', 1.5); outline.setAttribute('stroke-dasharray', '4,3');
      outline.setAttribute('pointer-events', 'none');
      g.appendChild(outline);

      // 単一選択時のみリサイズハンドルを描画（複数選択時は描画しない）
      const onlyOne = (S.selectedAnnIds.length <= 1);
      if (onlyOne) {
        if (ann.type === 'line' || ann.type === 'arrow') {
          // 線・矢印は始点・終点ハンドル
          const sp = pdfToCanvas(ann.startPoint.x, ann.startPoint.y, dims, zoom);
          const ep = pdfToCanvas(ann.endPoint.x, ann.endPoint.y, dims, zoom);
          for (const [pt, key] of [[sp, 'start'], [ep, 'end']]) {
            const h = document.createElementNS(ns, 'circle');
            h.setAttribute('cx', pt.x); h.setAttribute('cy', pt.y);
            h.setAttribute('r', 5);
            h.setAttribute('fill', 'white');
            h.setAttribute('stroke', '#3182ce');
            h.setAttribute('stroke-width', 1.5);
            h.dataset.resizeHandle = key;
            h.dataset.annId = ann.id;
            h.setAttribute('class', `ann-resize-handle handle-${key}`);
            g.appendChild(h);
          }
        } else {
          const handles = [
            ['nw', 0, 0],   ['n', 0.5, 0],   ['ne', 1, 0],
            ['w',  0, 0.5],                   ['e',  1, 0.5],
            ['sw', 0, 1],   ['s', 0.5, 1],   ['se', 1, 1],
          ];
          for (const [key, hx, hy] of handles) {
            const h = document.createElementNS(ns, 'rect');
            h.setAttribute('x', cr.x + hx*cr.width - 5);
            h.setAttribute('y', cr.y + hy*cr.height - 5);
            h.setAttribute('width', 10); h.setAttribute('height', 10);
            h.setAttribute('fill', 'white');
            h.setAttribute('stroke', '#3182ce');
            h.setAttribute('stroke-width', 1.5);
            h.dataset.resizeHandle = key;
            h.dataset.annId = ann.id;
            h.setAttribute('class', `ann-resize-handle handle-${key}`);
            g.appendChild(h);
          }
        }
      }
    }

    svg.appendChild(g);
  }
}

// SVGのtext要素は自動改行しないため、行ごとにtspanへ分ける。
function appendMultilineText(parent, ns, ann, cr, zoom, text, pageIndex) {
  const lines = String(text).split(/\r?\n/);
  const lineHeight = ann.fontSize * 1.25 * zoom;
  const baseY = cr.y + ann.fontSize * zoom;
  const txt = document.createElementNS(ns, 'text');
  txt.setAttribute('x', cr.x + 2);
  txt.setAttribute('y', baseY);
  txt.setAttribute('font-size', ann.fontSize * zoom);
  txt.setAttribute('fill', ann.fontColor); txt.setAttribute('opacity', ann.opacity);
  txt.style.userSelect = 'none'; txt.style.whiteSpace = 'pre';
  if (lines.length <= 1) {
    txt.textContent = lines[0] || '';
  } else {
    for (let i = 0; i < lines.length; i++) {
      const ts = document.createElementNS(ns, 'tspan');
      ts.setAttribute('x', cr.x + 2);
      if (i === 0) {
        ts.setAttribute('y', baseY);
      } else {
        ts.setAttribute('dy', lineHeight);
        ts.setAttribute('x', cr.x + 2);
      }
      ts.textContent = lines[i];
      txt.appendChild(ts);
    }
  }
  txt.addEventListener('dblclick', () => beginTextEdit(ann.id, pageIndex));
  parent.appendChild(txt);
}

function renderTextEditTargets(svg, pageIndex, dims, zoom, ns) {
  if (S.activeTool !== 'textedit') return;

  const editedSourceIds = new Set(
    S.annotations
      .filter((a) => a.type === 'textedit' && a.pageIndex === pageIndex)
      .map((a) => a.sourceId)
  );

  for (const item of S.textItems[pageIndex] || []) {
    if (editedSourceIds.has(item.id)) continue;
    const r = pdfRectToCanvas(item.rect, dims, zoom);
    const rect = document.createElementNS(ns, 'rect');
    rect.dataset.textItemId = item.id;
    rect.setAttribute('x', r.x - 1);
    rect.setAttribute('y', r.y - 1);
    rect.setAttribute('width', r.width + 2);
    rect.setAttribute('height', r.height + 2);
    rect.setAttribute('class', 'text-edit-target');
    svg.appendChild(rect);
  }
}

function renderAnnotationsAll() {
  document.querySelectorAll('.ann-svg').forEach((svg) => {
    const pageId = parsePageId(svg.dataset.page);
    if (pageId == null) return;
    renderAnnotationsSvg(svg, pageId);
  });
}

function beginTextEdit(annId, pageId) {
  const ann = S.annotations.find((a) => a.id === annId);
  if (!ann) return;
  const svg  = document.querySelector(`.ann-svg${pageDataSelector(pageId)}`);
  if (!svg) return;
  const dims = S.pageDims[pageId];
  const cr   = pdfRectToCanvas(ann.rect, dims, S.zoom);

  // foreignObject でテキストエリアを差し込む
  const ns  = 'http://www.w3.org/2000/svg';
  const fo  = document.createElementNS(ns, 'foreignObject');
  // 複数行入力が隠れないよう、テキスト注釈に最低限の高さを確保する。
  const multilineMin = Math.max(60, ann.fontSize * S.zoom * 2.4);
  const minH = (ann.type === 'freetext' || ann.type === 'textedit') ? multilineMin : 24;
  const w = Math.max(cr.width, 200);
  const h = Math.max(cr.height, minH);
  fo.setAttribute('x', cr.x); fo.setAttribute('y', cr.y);
  fo.setAttribute('width', w); fo.setAttribute('height', h);

  const ta = document.createElement('textarea');
  ta.value = ann.text || '';
  // Enterは改行に使うため、Ctrl+Enterを確定操作に割り当てる。
  Object.assign(ta.style, {
    width: '100%', height: '100%',
    background: 'rgba(255,255,255,0.92)',
    border: '1px dashed #666',
    fontSize: `${ann.fontSize * S.zoom}px`,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    color: ann.fontColor,
    resize: 'both', outline: 'none', padding: '2px',
    lineHeight: '1.25',
    whiteSpace: 'pre-wrap',
    overflow: 'auto',
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); ta.blur(); return; }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ta.blur(); return; }
  });
  ta.addEventListener('blur', () => {
    if (ta._committed) return;
    ta._committed = true;
    // 入力行数に合わせて注釈の高さを自動拡張する。
    const lines = ta.value.split(/\r?\n/).length;
    const minHeightPdf = (ann.fontSize * 1.25 * lines + 6);
    const changes = { text: ta.value };
    if (ann.type === 'freetext' || ann.type === 'textedit') {
      // PDF 座標 y は下端基準。高さを増やしても rect.y はそのままで OK
      const rect = { ...ann.rect, height: Math.max(ann.rect.height, minHeightPdf) };
      changes.rect = rect;
    }
    updateAnnotation(annId, changes);
    fo.remove();
  });
  fo.appendChild(ta);
  svg.appendChild(fo);
  ta.focus();
  // 末尾にキャレットを置く
  try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (_) { /* noop */ }
}

function setStatus(text) {
  const el = document.getElementById('status-text');
  if (el) el.textContent = text;
}

let toastTimer = null;
function showToast(message, variant = 'info', duration = 3200) {
  const el = document.getElementById('toast');
  if (!el) { setStatus(message); return; }
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  el.textContent = message;
  el.dataset.variant = variant;
  el.classList.remove('hidden');
  // 強制リフロー→フェードイン用クラス
  void el.offsetWidth;
  el.classList.add('show');
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
    toastTimer = setTimeout(() => { el.classList.add('hidden'); toastTimer = null; }, 220);
  }, duration);
  setStatus(message);
}

function setDirty(value) {
  const next = !!value;
  S.dirty = next;
  const btn = document.getElementById('btn-save');
  if (btn) btn.classList.toggle('has-changes', next);
}

function setBusy(isBusy, text = '') {
  document.body.classList.toggle('is-busy', isBusy);
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.classList.toggle('hidden', !isBusy);
  if (text) setStatus(text);
}

// 保存設定は次回利用へ引き継ぐが、開いたPDF固有の状態は保存しない。

const SAVE_SETTINGS_KEY = 'pdf-editor-save-settings';
const PROJECT_SCHEMA_VERSION = 1;

function loadSaveSettings() {
  try {
    const raw = localStorage.getItem(SAVE_SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.mode === 'standard' || parsed.mode === 'flatten' || parsed.mode === 'project') {
      S.saveSettings.mode = parsed.mode;
    }
    if (typeof parsed.filenameTemplate === 'string' && parsed.filenameTemplate.trim()) {
      S.saveSettings.filenameTemplate = parsed.filenameTemplate;
    }
    if (parsed.metadata && typeof parsed.metadata === 'object') {
      const m = parsed.metadata;
      const dst = S.saveSettings.metadata;
      if (typeof m.title === 'string') dst.title = m.title;
      if (typeof m.author === 'string') dst.author = m.author;
      if (typeof m.subject === 'string') dst.subject = m.subject;
      if (Array.isArray(m.keywords)) dst.keywords = m.keywords.slice();
      else if (typeof m.keywords === 'string') dst.keywords = parseKeywordsInput(m.keywords);
      if (typeof m.producer === 'string') dst.producer = m.producer;
      if (typeof m.creator === 'string') dst.creator = m.creator;
    }
    if (parsed.metadataUserEdited && typeof parsed.metadataUserEdited === 'object') {
      const e = parsed.metadataUserEdited;
      for (const k of Object.keys(S.saveSettings.metadataUserEdited)) {
        S.saveSettings.metadataUserEdited[k] = !!e[k];
      }
    }
  } catch (err) {
    console.warn('loadSaveSettings failed', err);
  }
}

function persistSaveSettings() {
  try {
    localStorage.setItem(SAVE_SETTINGS_KEY, JSON.stringify(S.saveSettings));
  } catch (err) {
    console.warn('persistSaveSettings failed', err);
  }
}

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateForFilename(d, withTime) {
  const y = d.getFullYear();
  const m = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  if (!withTime) return `${y}-${m}-${day}`;
  return `${y}-${m}-${day}_${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

function sanitizeFilename(name) {
  // Windows / macOS で使えない文字を除去（拡張子は呼び出し側で付ける）
  return String(name || '').replace(/[\\/:*?"<>| -]/g, '_').trim() || 'document';
}

function renderFilename(template, mode, ext) {
  const original = (S.fileName || 'document').replace(/\.pdf$/i, '');
  const now = new Date();
  const tmpl = (template || '{original}_edited').toString();
  let out = tmpl
    .replace(/\{original\}/g, original)
    .replace(/\{datetime\}/g, formatDateForFilename(now, true))
    .replace(/\{date\}/g, formatDateForFilename(now, false))
    .replace(/\{mode\}/g, mode || S.saveSettings.mode || 'standard')
    .replace(/\{pages\}/g, String(S.pageOrder?.length ?? 0));
  out = sanitizeFilename(out);
  if (ext && !new RegExp(`\\.${ext}$`, 'i').test(out)) out += `.${ext}`;
  return out;
}

// ユーザーが未編集の項目だけ、元PDFのメタデータで補う。
function prefillMetadataFromPdf() {
  try {
    if (!S.pdfDoc?.getMetadata) return;
  } catch (_) { return; }
  S.pdfDoc.getMetadata().then((meta) => {
    if (!meta || !meta.info) return;
    const info = meta.info;
    const dst = S.saveSettings.metadata;
    const edited = S.saveSettings.metadataUserEdited;
    const set = (key, value) => {
      if (edited[key]) return;
      if (value == null) return;
      if (key === 'keywords') {
        const arr = Array.isArray(value) ? value : parseKeywordsInput(value);
        dst.keywords = arr;
      } else {
        dst[key] = String(value);
      }
    };
    set('title', info.Title);
    set('author', info.Author);
    set('subject', info.Subject);
    set('keywords', info.Keywords);
    set('producer', info.Producer);
    set('creator', info.Creator);
    if (saveModalState.open) populateSaveModalControls();
  }).catch((err) => console.warn('prefillMetadataFromPdf failed', err));
}

// 保存モーダルの入力を共有状態へ同期する。
function populateSaveModalControls() {
  const modeRadios = document.querySelectorAll('input[name="save-mode"]');
  modeRadios.forEach((el) => { el.checked = (el.value === S.saveSettings.mode); });
  const tmplInput = document.getElementById('save-filename-template');
  if (tmplInput) tmplInput.value = S.saveSettings.filenameTemplate || '';
  const m = S.saveSettings.metadata;
  const setVal = (id, value) => { const el = document.getElementById(id); if (el) el.value = value ?? ''; };
  setVal('meta-title', m.title);
  setVal('meta-author', m.author);
  setVal('meta-subject', m.subject);
  setVal('meta-keywords', keywordsToString(m.keywords));
  setVal('meta-producer', m.producer);
  setVal('meta-creator', m.creator);
  renderFilenamePreview();
}

function renderFilenamePreview() {
  const el = document.getElementById('save-filename-preview');
  if (!el) return;
  const tmplInput = document.getElementById('save-filename-template');
  const tmpl = tmplInput?.value || S.saveSettings.filenameTemplate || '{original}_edited';
  const mode = S.saveSettings.mode || 'standard';
  el.textContent = renderFilename(tmpl, mode, 'pdf');
}

// 保存モーダルのセクション切替
function setSaveModalSection(sectionName) {
  const valid = ['preview', 'mode', 'metadata'];
  const target = valid.includes(sectionName) ? sectionName : 'preview';
  document.querySelectorAll('.save-modal-section').forEach((el) => {
    el.classList.toggle('active', el.dataset.section === target);
  });
  document.querySelectorAll('[data-section-target]').forEach((el) => {
    el.style.display = (el.dataset.sectionTarget === target) ? '' : 'none';
  });
}

// 保存失敗時の詳細表示
function showSaveErrorModal(err) {
  const modal = document.getElementById('save-error-modal');
  if (!modal) { showToast('PDFの保存に失敗しました', 'error'); return; }
  const msgEl = document.getElementById('save-error-message');
  const stackEl = document.getElementById('save-error-stack');
  const message = (err && (err.message || err.toString())) || '不明なエラー';
  const stack = (err && err.stack) || '(スタックトレースなし)';
  if (msgEl) msgEl.textContent = message;
  if (stackEl) stackEl.textContent = stack;
  modal.classList.remove('hidden');
}

function closeSaveErrorModal() {
  const modal = document.getElementById('save-error-modal');
  if (modal) modal.classList.add('hidden');
}

async function copySaveErrorToClipboard() {
  const msg = document.getElementById('save-error-message')?.textContent || '';
  const stack = document.getElementById('save-error-stack')?.textContent || '';
  const payload = `PDF Editor Error\n\n${msg}\n\n----\n${stack}`;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload);
    } else {
      const ta = document.createElement('textarea');
      ta.value = payload;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast('エラー内容をコピーしました', 'success', 1600);
  } catch (e) {
    console.error(e);
    showToast('クリップボードへのコピーに失敗しました', 'error');
  }
}

// プロジェクトJSONには元PDF本体を含めず、再編集に必要な差分だけを保存する。
function buildProjectJson() {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    fileName: S.fileName,
    annotations: S.annotations.map((a) => ({ ...a })),
    pageOrder: S.pageOrder.slice(),
    pageRotations: { ...S.pageRotations },
    pageSources: cloneSources(S.pageSources),
    pageDims: clonePageDims(S.pageDims),
    watermarkConfig: { ...S.watermarkConfig },
    pageNumberConfig: { ...S.pageNumberConfig },
    headerFooterConfig: {
      header: { ...S.headerFooterConfig.header },
      footer: { ...S.headerFooterConfig.footer },
    },
    saveSettings: JSON.parse(JSON.stringify(S.saveSettings)),
  };
}

// プロジェクト復元は、対応する元PDFが先に開かれていることを前提とする。
function applyProjectJson(project) {
  if (!project || typeof project !== 'object') {
    throw new Error('プロジェクトファイルの内容が不正です');
  }
  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error(`未対応の schemaVersion: ${project.schemaVersion}`);
  }
  if (!Array.isArray(project.pageOrder) || !project.pageOrder.length) {
    throw new Error('pageOrder が空です');
  }
  // ID カウンタを衝突しないよう調整
  let maxIdNum = S.pageIdCounter || 0;
  const pickNum = (id) => {
    if (typeof id !== 'string') return;
    const m = /-(\d+)$/.exec(id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxIdNum) maxIdNum = n;
    }
  };
  for (const id of project.pageOrder) pickNum(id);
  S.pageIdCounter = maxIdNum;

  // 注釈
  S.annotations = Array.isArray(project.annotations) ? project.annotations.map((a) => ({ ...a })) : [];
  // imported (結合元) ページは現状 importedPdfs にバイトが存在しないと再現できないため、フィルタする
  const sources = cloneSources(project.pageSources || {});
  const droppedImported = new Set();
  for (const id of project.pageOrder) {
    const src = sources[id];
    if (src && src.kind && (src.kind === 'imported' || (src.sourceKey && !S.importedPdfs[src.sourceKey]))) {
      droppedImported.add(id);
    }
  }
  S.pageOrder = project.pageOrder.filter((id) => !droppedImported.has(id));
  if (!S.pageOrder.length) {
    throw new Error('結合元 PDF が見つからないため復元できません');
  }
  S.pageRotations = { ...(project.pageRotations || {}) };
  for (const id of droppedImported) delete S.pageRotations[id];
  S.pageSources = {};
  for (const id of S.pageOrder) if (sources[id]) S.pageSources[id] = sources[id];
  S.pageDims = clonePageDims(project.pageDims || {});
  for (const id of droppedImported) delete S.pageDims[id];
  S.annotations = S.annotations.filter((a) => !droppedImported.has(a.pageIndex));
  if (project.watermarkConfig) S.watermarkConfig = { ...project.watermarkConfig };
  if (project.pageNumberConfig) S.pageNumberConfig = { ...project.pageNumberConfig };
  if (project.headerFooterConfig) {
    S.headerFooterConfig = {
      header: { ...(project.headerFooterConfig.header || {}) },
      footer: { ...(project.headerFooterConfig.footer || {}) },
    };
  }
  if (project.saveSettings && typeof project.saveSettings === 'object') {
    const ss = project.saveSettings;
    if (ss.mode === 'standard' || ss.mode === 'flatten' || ss.mode === 'project') S.saveSettings.mode = ss.mode;
    if (typeof ss.filenameTemplate === 'string') S.saveSettings.filenameTemplate = ss.filenameTemplate;
    if (ss.metadata && typeof ss.metadata === 'object') {
      const dst = S.saveSettings.metadata;
      const m = ss.metadata;
      if (typeof m.title === 'string') dst.title = m.title;
      if (typeof m.author === 'string') dst.author = m.author;
      if (typeof m.subject === 'string') dst.subject = m.subject;
      if (Array.isArray(m.keywords)) dst.keywords = m.keywords.slice();
      else if (typeof m.keywords === 'string') dst.keywords = parseKeywordsInput(m.keywords);
      if (typeof m.producer === 'string') dst.producer = m.producer;
      if (typeof m.creator === 'string') dst.creator = m.creator;
    }
    if (ss.metadataUserEdited) {
      for (const k of Object.keys(S.saveSettings.metadataUserEdited)) {
        S.saveSettings.metadataUserEdited[k] = !!ss.metadataUserEdited[k];
      }
    }
  }
  S.totalPages = S.pageOrder.length;
  S.currentPage = S.pageOrder[0];
  S.selectedId = null;
  S.selectedAnnIds = [];
  S.selectedIds = [];
  S.selectionAnchor = null;
  // 検索インデックスは構造変更を受けて作り直し
  S.searchIndex = null;
  S.searchResults = [];
  S.searchActiveIndex = -1;
  // 履歴: 復元状態を新しい起点とする
  S.history = [createSnapshot(S.annotations, S.pageOrder, S.pageRotations, S.pageSources, S.pageDims)];
  S.histIdx = 0;
  S.savedHistIdx = 0;
}

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 即時 revoke するとブラウザによってはダウンロード前に切れるので少し遅延
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function applyFit(mode) {
  if (!S.pdfDoc) return;
  const dims = getVisualPageDims(S.currentPage);
  const viewer = document.getElementById('viewer');
  if (!dims || !viewer) return;

  const availableW = Math.max(120, viewer.clientWidth - 56);
  const availableH = Math.max(120, viewer.clientHeight - 56);
  S.fitMode = mode;
  S.zoom = mode === 'width'
    ? availableW / dims.width
    : Math.min(availableW / dims.width, availableH / dims.height);
  S.zoom = Math.min(4, Math.max(0.25, S.zoom));
  document.getElementById('zoom-select').value = String(S.zoom);
  renderViewer();
  setStatus(mode === 'width' ? '幅に合わせて表示中' : 'ページ全体に合わせて表示中');
}

// ============================================================
// 状態からUI表示を更新する。
// ============================================================

function updatePageNav() {
  const orderIndex = getCurrentOrderIndex();
  document.getElementById('page-input').value = orderIndex + 1;
  document.getElementById('btn-prev').disabled = orderIndex === 0;
  document.getElementById('btn-next').disabled = orderIndex >= S.pageOrder.length - 1;
  document.getElementById('page-total').textContent = `/ ${S.pageOrder.length}`;
}

function updatePageEditButtons() {
  const has = !!S.pdfDoc;
  const targetCount = (S.selectedIds.length > 0 ? S.selectedIds.length : (has ? 1 : 0));
  const elDup = document.getElementById('btn-page-duplicate');
  const elDel = document.getElementById('btn-page-delete');
  const elFirst = document.getElementById('btn-page-first');
  const elLast = document.getElementById('btn-page-last');
  const elBlank = document.getElementById('btn-page-blank');
  const elExtract = document.getElementById('btn-extract');
  if (!elDup) return;
  const canDelete = has && (S.pageOrder.length - targetCount) >= 1;
  elDup.disabled = !has;
  elDel.disabled = !canDelete;
  elFirst.disabled = !has;
  elLast.disabled = !has;
  elBlank.disabled = !has;
  if (elExtract) elExtract.disabled = !has;
  const suffix = S.selectedIds.length > 1 ? ` (${S.selectedIds.length})` : '';
  elDup.title = `選択ページを複製${suffix}`;
  elDel.title = `選択ページを削除${suffix}`;
  elFirst.title = `選択ページを先頭へ移動${suffix}`;
  elLast.title = `選択ページを末尾へ移動${suffix}`;
}

function updateUndoRedo() {
  document.getElementById('btn-undo').disabled = S.histIdx <= 0;
  document.getElementById('btn-redo').disabled = S.histIdx >= S.history.length - 1;
}

// プロパティ変更は選択中の全注釈へまとめて適用する。
function applyToSelected(changes) {
  const ids = S.selectedAnnIds.length ? S.selectedAnnIds : (S.selectedId ? [S.selectedId] : []);
  if (!ids.length) return;
  S.annotations = S.annotations.map((a) => ids.includes(a.id) ? { ...a, ...changes } : a);
  pushHistory();
  renderAnnotationsAll();
  updateUndoRedo();
}

// ============================================================
// 注釈プリセットはPDFに依存しないためlocalStorageへ保存する。
// ============================================================

const PRESET_KEY = 'pdf-editor-annotation-presets';
let presetCache = [];

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    presetCache = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(presetCache)) presetCache = [];
  } catch (_) {
    presetCache = [];
  }
}

function savePresetsToStorage() {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(presetCache));
  } catch (_) {
    showToast('プリセットの保存に失敗しました', 'error');
  }
}

function savePresetFromCurrent() {
  const opts = S.toolOptions;
  const sel = S.annotations.find((a) => a.id === S.selectedId);
  const preset = {
    id: `p${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
    color: sel?.color || opts.color,
    fillColor: sel?.fillColor ?? opts.fillColor,
    strokeWidth: sel?.strokeWidth ?? opts.strokeWidth,
    opacity: sel?.opacity ?? opts.opacity,
    fontSize: sel?.fontSize ?? opts.fontSize,
    fontColor: sel?.fontColor ?? opts.fontColor,
  };
  presetCache.push(preset);
  if (presetCache.length > 20) presetCache = presetCache.slice(-20);
  savePresetsToStorage();
  renderPresetsUI();
  showToast('プリセットを保存しました', 'success', 1600);
}

function applyPreset(preset) {
  S.toolOptions.color = preset.color;
  S.toolOptions.fillColor = preset.fillColor ?? null;
  S.toolOptions.strokeWidth = preset.strokeWidth ?? 2;
  S.toolOptions.opacity = preset.opacity ?? 1;
  S.toolOptions.fontSize = preset.fontSize ?? 14;
  S.toolOptions.fontColor = preset.fontColor ?? '#1a202c';
  // UI 反映
  const cc = document.getElementById('color-custom'); if (cc) cc.value = preset.color;
  const op = document.getElementById('opt-opacity'); if (op) op.value = preset.opacity ?? 1;
  const opv = document.getElementById('opt-opacity-val'); if (opv) opv.textContent = `${Math.round((preset.opacity ?? 1) * 100)}%`;
  const sw = document.getElementById('opt-stroke'); if (sw) sw.value = preset.strokeWidth ?? 2;
  const fs = document.getElementById('opt-fontsize'); if (fs) fs.value = preset.fontSize ?? 14;
  const fc = document.getElementById('opt-fontcolor'); if (fc) fc.value = preset.fontColor ?? '#1a202c';
  // 選択中があれば適用
  applyToSelected({
    color: preset.color,
    fillColor: preset.fillColor ?? null,
    strokeWidth: preset.strokeWidth,
    opacity: preset.opacity,
    fontSize: preset.fontSize,
    fontColor: preset.fontColor,
  });
}

function deletePreset(id) {
  presetCache = presetCache.filter((p) => p.id !== id);
  savePresetsToStorage();
  renderPresetsUI();
}

// ============================================================
// 画像・署名・スタンプ・QR・全ページ装飾の挿入処理
// ============================================================

const SIGNATURE_STORE_KEY = 'pdf-editor-signatures';
const STAMP_STORE_KEY = 'pdf-editor-stamps';
let signatureLibrary = [];
let stampLibrary = [];
// QR モジュール計算のメモ化（注釈 id ごと）
const qrModuleCache = new Map();

const DEFAULT_STAMPS = [
  { id: 'def-stamp-approve', text: '承認',  color: '#c53030', borderColor: '#c53030', fontSize: 32, strokeWidth: 2, builtin: true },
  { id: 'def-stamp-done',    text: '完了',  color: '#2f855a', borderColor: '#2f855a', fontSize: 32, strokeWidth: 2, builtin: true },
  { id: 'def-stamp-urgent',  text: '至急',  color: '#c53030', borderColor: '#c53030', fontSize: 32, strokeWidth: 2.5, builtin: true },
  { id: 'def-stamp-confid',  text: '機密',  color: '#9b2c2c', borderColor: '#9b2c2c', fontSize: 32, strokeWidth: 2, builtin: true },
  { id: 'def-stamp-draft',   text: '下書き', color: '#b7791f', borderColor: '#b7791f', fontSize: 28, strokeWidth: 2, builtin: true },
];

function loadSignatures() {
  try {
    const raw = localStorage.getItem(SIGNATURE_STORE_KEY);
    signatureLibrary = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(signatureLibrary)) signatureLibrary = [];
  } catch (_) {
    signatureLibrary = [];
  }
}

function saveSignatures() {
  try {
    localStorage.setItem(SIGNATURE_STORE_KEY, JSON.stringify(signatureLibrary));
  } catch (err) {
    console.error(err);
    showToast('署名の保存に失敗しました（容量超過の可能性）', 'error');
  }
}

function loadStamps() {
  try {
    const raw = localStorage.getItem(STAMP_STORE_KEY);
    const stored = raw ? JSON.parse(raw) : [];
    stampLibrary = Array.isArray(stored) ? stored : [];
  } catch (_) {
    stampLibrary = [];
  }
}

function saveStamps() {
  try {
    localStorage.setItem(STAMP_STORE_KEY, JSON.stringify(stampLibrary));
  } catch (err) {
    console.error(err);
    showToast('スタンプの保存に失敗しました', 'error');
  }
}

function getAllStamps() {
  return [...DEFAULT_STAMPS, ...stampLibrary];
}

function ensureQrModules(ann) {
  if (!ann.text || !globalThis.QRCodeGen) return null;
  const cacheKey = `${ann.id}|${ann.text}|${ann.errorLevel || 'M'}`;
  if (qrModuleCache.has(cacheKey)) return qrModuleCache.get(cacheKey);
  try {
    const qr = globalThis.QRCodeGen.generate(ann.text, ann.errorLevel || 'M');
    qrModuleCache.set(cacheKey, qr);
    return qr;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function imageNaturalSize(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// 現在ページの中央付近に既定サイズで配置する PDF 矩形を生成する
function defaultInsertRect(naturalW, naturalH, maxPdfDim) {
  const pageId = S.currentPage;
  const dims = S.pageDims[pageId] || { width: 595.28, height: 841.89 };
  const aspect = (naturalW && naturalH) ? naturalW / naturalH : 1;
  const limit = Math.min(maxPdfDim || 240, Math.min(dims.width, dims.height) * 0.6);
  let w, h;
  if (aspect >= 1) { w = limit; h = limit / aspect; }
  else { h = limit; w = limit * aspect; }
  const x = Math.max(0, (dims.width - w) / 2);
  const y = Math.max(0, (dims.height - h) / 2);
  return { x, y, width: w, height: h };
}

async function insertImageAnnotation(dataUrl, mime, opts = {}) {
  if (!S.pdfDoc) return;
  let nat;
  try { nat = await imageNaturalSize(dataUrl); } catch (_) { nat = { width: 200, height: 200 }; }
  const rect = opts.rect || defaultInsertRect(nat.width, nat.height, 240);
  const ann = {
    id: genId(),
    type: opts.type || 'image',
    pageIndex: S.currentPage,
    src: dataUrl,
    mime: mime || 'image/png',
    rect,
    opacity: 1,
    naturalWidth: nat.width,
    naturalHeight: nat.height,
  };
  addAnnotation(ann);
  setActiveTool('select');
  setSelectedAnnIds([ann.id]);
  renderAnnotationsAll();
  updateOptionsPanel();
  showToast(opts.type === 'signature' ? '署名を挿入しました' : '画像を挿入しました', 'success', 1600);
}

async function insertStampAnnotation(stamp) {
  if (!S.pdfDoc) return;
  // スタンプの推奨アスペクト比でサイズを推定
  const fs = stamp.fontSize || 32;
  const approxW = Math.max(80, (stamp.text || '').length * fs * 1.2 + fs);
  const approxH = fs * 1.8;
  const rect = defaultInsertRect(approxW, approxH, Math.max(approxW, 220));
  const ann = {
    id: genId(),
    type: 'stamp',
    pageIndex: S.currentPage,
    rect,
    text: stamp.text || '',
    color: stamp.color || '#c53030',
    borderColor: stamp.borderColor || stamp.color || '#c53030',
    strokeWidth: stamp.strokeWidth ?? 2,
    fontSize: fs,
    opacity: 1,
  };
  addAnnotation(ann);
  setActiveTool('select');
  setSelectedAnnIds([ann.id]);
  renderAnnotationsAll();
  updateOptionsPanel();
  showToast('スタンプを挿入しました', 'success', 1600);
}

function insertQrAnnotation({ text, size, errorLevel, fgColor, bgColor }) {
  if (!S.pdfDoc) return;
  if (!text) {
    showToast('QRコードのテキストを入力してください', 'error');
    return;
  }
  // 生成可能か事前チェック
  try {
    globalThis.QRCodeGen?.generate(text, errorLevel || 'M');
  } catch (err) {
    showToast('QRコードを生成できません（データが大きすぎます）', 'error');
    return;
  }
  const s = Math.max(40, Math.min(600, size || 120));
  const dims = S.pageDims[S.currentPage] || { width: 595.28, height: 841.89 };
  const x = Math.max(0, (dims.width - s) / 2);
  const y = Math.max(0, (dims.height - s) / 2);
  const ann = {
    id: genId(),
    type: 'qrcode',
    pageIndex: S.currentPage,
    rect: { x, y, width: s, height: s },
    text,
    errorLevel: errorLevel || 'M',
    fgColor: fgColor || '#000000',
    bgColor: bgColor || '#ffffff',
    opacity: 1,
  };
  addAnnotation(ann);
  setActiveTool('select');
  setSelectedAnnIds([ann.id]);
  renderAnnotationsAll();
  updateOptionsPanel();
  showToast('QRコードを挿入しました', 'success', 1600);
}

// ---- ライブラリ管理（署名） ----

function addSignatureFromDataUrl(dataUrl, name) {
  const id = `sig-${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
  signatureLibrary.push({ id, dataUrl, name: name || '署名', mime: 'image/png' });
  if (signatureLibrary.length > 30) signatureLibrary = signatureLibrary.slice(-30);
  saveSignatures();
  renderSignatureList();
}

function deleteSignature(id) {
  signatureLibrary = signatureLibrary.filter((s) => s.id !== id);
  saveSignatures();
  renderSignatureList();
}

function renderSignatureList() {
  const host = document.getElementById('signature-list');
  if (!host) return;
  host.innerHTML = '';
  if (!signatureLibrary.length) {
    const empty = document.createElement('div');
    empty.className = 'library-card-empty';
    empty.textContent = '登録された署名はありません。下のボタンから画像を追加してください。';
    host.appendChild(empty);
    return;
  }
  for (const sig of signatureLibrary) {
    const card = document.createElement('div');
    card.className = 'library-card';
    card.innerHTML = `
      <div class="library-card-preview"><img alt="${escapeHtml(sig.name)}" src="${sig.dataUrl}"></div>
      <div class="library-card-label">${escapeHtml(sig.name)}</div>
      <button type="button" class="library-card-delete" title="削除">×</button>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.library-card-delete')) return;
      insertImageAnnotation(sig.dataUrl, sig.mime || 'image/png', { type: 'signature' });
      closeModal('signature-modal');
    });
    card.querySelector('.library-card-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      if (window.confirm('この署名を削除しますか？')) deleteSignature(sig.id);
    });
    host.appendChild(card);
  }
}

// ---- ライブラリ管理（スタンプ） ----

function addStamp(stamp) {
  const id = `stp-${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
  stampLibrary.push({ id, ...stamp });
  if (stampLibrary.length > 40) stampLibrary = stampLibrary.slice(-40);
  saveStamps();
  renderStampList();
}

function deleteStamp(id) {
  stampLibrary = stampLibrary.filter((s) => s.id !== id);
  saveStamps();
  renderStampList();
}

function renderStampList() {
  const host = document.getElementById('stamp-list');
  if (!host) return;
  host.innerHTML = '';
  const all = getAllStamps();
  if (!all.length) {
    const empty = document.createElement('div');
    empty.className = 'library-card-empty';
    empty.textContent = 'スタンプがありません';
    host.appendChild(empty);
    return;
  }
  for (const stamp of all) {
    const card = document.createElement('div');
    card.className = 'library-card';
    const previewSize = Math.min(48, stamp.fontSize || 32);
    card.innerHTML = `
      <div class="library-card-preview">
        <div class="stamp-preview" style="color:${escapeHtml(stamp.color)};border-color:${escapeHtml(stamp.borderColor || stamp.color)};font-size:${previewSize}px">${escapeHtml(stamp.text || '')}</div>
      </div>
      <div class="library-card-label">${escapeHtml(stamp.text || '')}${stamp.builtin ? '（既定）' : ''}</div>
      ${stamp.builtin ? '' : '<button type="button" class="library-card-delete" title="削除">×</button>'}
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.library-card-delete')) return;
      insertStampAnnotation(stamp);
      closeModal('stamp-modal');
    });
    const del = card.querySelector('.library-card-delete');
    if (del) {
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.confirm('このスタンプを削除しますか？')) deleteStamp(stamp.id);
      });
    }
    host.appendChild(card);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

// ---- 透かし / ページ番号 / ヘッダーフッター モーダル ----

function openWatermarkModal() {
  const wm = S.watermarkConfig;
  document.getElementById('wm-enabled').checked = !!wm.enabled;
  document.getElementById('wm-text').value = wm.text || '';
  document.getElementById('wm-fontsize').value = wm.fontSize ?? 80;
  document.getElementById('wm-color').value = wm.color || '#e53e3e';
  document.getElementById('wm-opacity').value = wm.opacity ?? 0.2;
  document.getElementById('wm-opacity-val').textContent = `${Math.round((wm.opacity ?? 0.2) * 100)}%`;
  document.getElementById('wm-angle').value = wm.angle ?? -30;
  document.getElementById('wm-placement').value = wm.placement || 'center';
  document.getElementById('wm-scope').value = wm.scope || 'all';
  openModal('watermark-modal');
}

function applyWatermarkFromModal() {
  const next = {
    enabled: document.getElementById('wm-enabled').checked,
    text: document.getElementById('wm-text').value || '',
    fontSize: parseInt(document.getElementById('wm-fontsize').value, 10) || 80,
    color: document.getElementById('wm-color').value || '#e53e3e',
    opacity: parseFloat(document.getElementById('wm-opacity').value) || 0.2,
    angle: parseFloat(document.getElementById('wm-angle').value) || 0,
    placement: document.getElementById('wm-placement').value || 'center',
    scope: document.getElementById('wm-scope').value || 'all',
    appliedToPageId: document.getElementById('wm-scope').value === 'current' ? S.currentPage : null,
  };
  S.watermarkConfig = next;
  pushHistory();
  updateUndoRedo();
  closeModal('watermark-modal');
  showToast(next.enabled ? '透かしを設定しました（保存時に焼き込み）' : '透かしを無効にしました', 'success', 2000);
}

function openPageNumberModal() {
  const pn = S.pageNumberConfig;
  document.getElementById('pn-enabled').checked = !!pn.enabled;
  document.getElementById('pn-format').value = pn.format || '{n}/{total}';
  const customEl = document.getElementById('pn-format-custom');
  customEl.value = pn.customFormat || '';
  customEl.style.display = pn.format === 'custom' ? '' : 'none';
  document.getElementById('pn-position').value = pn.position || 'bc';
  document.getElementById('pn-fontsize').value = pn.fontSize ?? 11;
  document.getElementById('pn-color').value = pn.color || '#1a202c';
  document.getElementById('pn-start').value = pn.start ?? 1;
  document.getElementById('pn-from').value = pn.fromPage ?? 1;
  const offX = document.getElementById('pn-offset-x');
  const offY = document.getElementById('pn-offset-y');
  if (offX) offX.value = Math.round(pn.offsetX ?? 0);
  if (offY) offY.value = Math.round(pn.offsetY ?? 0);
  openModal('pagenum-modal');
}

function applyPageNumberFromModal() {
  const fmt = document.getElementById('pn-format').value;
  const customFormat = document.getElementById('pn-format-custom').value || '';
  S.pageNumberConfig = {
    enabled: document.getElementById('pn-enabled').checked,
    format: fmt,
    customFormat,
    position: document.getElementById('pn-position').value || 'bc',
    fontSize: parseInt(document.getElementById('pn-fontsize').value, 10) || 11,
    color: document.getElementById('pn-color').value || '#1a202c',
    start: parseInt(document.getElementById('pn-start').value, 10) || 1,
    fromPage: parseInt(document.getElementById('pn-from').value, 10) || 1,
    offsetX: parseFloat(document.getElementById('pn-offset-x')?.value) || 0,
    offsetY: parseFloat(document.getElementById('pn-offset-y')?.value) || 0,
  };
  pushHistory();
  updateUndoRedo();
  refreshPageNumberOverlays();
  closeModal('pagenum-modal');
  showToast(S.pageNumberConfig.enabled ? 'ページ番号を設定しました' : 'ページ番号を無効にしました', 'success', 2000);
}

function openHeaderFooterModal() {
  const hf = S.headerFooterConfig;
  document.getElementById('hf-h-enabled').checked = !!hf.header.enabled;
  document.getElementById('hf-h-text').value = hf.header.text || '';
  document.getElementById('hf-h-align').value = hf.header.align || 'center';
  document.getElementById('hf-h-fontsize').value = hf.header.fontSize ?? 11;
  document.getElementById('hf-h-color').value = hf.header.color || '#1a202c';
  document.getElementById('hf-f-enabled').checked = !!hf.footer.enabled;
  document.getElementById('hf-f-text').value = hf.footer.text || '';
  document.getElementById('hf-f-align').value = hf.footer.align || 'center';
  document.getElementById('hf-f-fontsize').value = hf.footer.fontSize ?? 11;
  document.getElementById('hf-f-color').value = hf.footer.color || '#1a202c';
  openModal('hf-modal');
}

function applyHeaderFooterFromModal() {
  S.headerFooterConfig = {
    header: {
      enabled: document.getElementById('hf-h-enabled').checked,
      text: document.getElementById('hf-h-text').value || '',
      align: document.getElementById('hf-h-align').value || 'center',
      fontSize: parseInt(document.getElementById('hf-h-fontsize').value, 10) || 11,
      color: document.getElementById('hf-h-color').value || '#1a202c',
    },
    footer: {
      enabled: document.getElementById('hf-f-enabled').checked,
      text: document.getElementById('hf-f-text').value || '',
      align: document.getElementById('hf-f-align').value || 'center',
      fontSize: parseInt(document.getElementById('hf-f-fontsize').value, 10) || 11,
      color: document.getElementById('hf-f-color').value || '#1a202c',
    },
  };
  pushHistory();
  updateUndoRedo();
  closeModal('hf-modal');
  showToast('ヘッダー / フッターを設定しました', 'success', 2000);
}

function openQrModal() {
  document.getElementById('qr-text').value = '';
  document.getElementById('qr-size').value = 120;
  document.getElementById('qr-ec').value = 'M';
  document.getElementById('qr-fg').value = '#000000';
  document.getElementById('qr-bg').value = '#ffffff';
  renderQrPreview();
  openModal('qr-modal');
  setTimeout(() => document.getElementById('qr-text')?.focus(), 50);
}

function renderQrPreview() {
  const host = document.getElementById('qr-preview');
  if (!host) return;
  const text = document.getElementById('qr-text').value || '';
  const fg = document.getElementById('qr-fg').value || '#000000';
  const bg = document.getElementById('qr-bg').value || '#ffffff';
  const ec = document.getElementById('qr-ec').value || 'M';
  host.innerHTML = '';
  if (!text) {
    const e = document.createElement('span');
    e.className = 'qr-empty';
    e.textContent = 'テキストを入力するとプレビューを表示します';
    host.appendChild(e);
    return;
  }
  if (!globalThis.QRCodeGen) {
    host.textContent = 'QRライブラリが読み込まれていません';
    return;
  }
  let qr;
  try {
    qr = globalThis.QRCodeGen.generate(text, ec);
  } catch (err) {
    const e = document.createElement('span');
    e.className = 'qr-empty';
    e.textContent = 'データが大きすぎます';
    host.appendChild(e);
    return;
  }
  const cell = 6;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const size = qr.size * cell;
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bgRect.setAttribute('x', 0); bgRect.setAttribute('y', 0);
  bgRect.setAttribute('width', size); bgRect.setAttribute('height', size);
  bgRect.setAttribute('fill', bg);
  svg.appendChild(bgRect);
  for (let r = 0; r < qr.size; r++) {
    for (let c = 0; c < qr.size; c++) {
      if (!qr.modules[r][c]) continue;
      const rectEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rectEl.setAttribute('x', c * cell);
      rectEl.setAttribute('y', r * cell);
      rectEl.setAttribute('width', cell);
      rectEl.setAttribute('height', cell);
      rectEl.setAttribute('fill', fg);
      svg.appendChild(rectEl);
    }
  }
  host.appendChild(svg);
}

function applyQrFromModal() {
  const text = document.getElementById('qr-text').value || '';
  if (!text) { showToast('QRコードのテキストを入力してください', 'error'); return; }
  insertQrAnnotation({
    text,
    size: parseInt(document.getElementById('qr-size').value, 10) || 120,
    errorLevel: document.getElementById('qr-ec').value || 'M',
    fgColor: document.getElementById('qr-fg').value || '#000000',
    bgColor: document.getElementById('qr-bg').value || '#ffffff',
  });
  closeModal('qr-modal');
}

function renderPresetsUI() {
  const host = document.getElementById('preset-list');
  if (!host) return;
  host.innerHTML = '';
  for (const p of presetCache) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'preset-chip';
    chip.title = `色 ${p.color} / 線幅 ${p.strokeWidth ?? '-'} / 不透明度 ${Math.round((p.opacity ?? 1) * 100)}%`;
    chip.innerHTML = `<span class="preset-chip-swatch" style="background:${p.color}"></span><span class="preset-chip-del" title="削除" data-del="${p.id}">×</span>`;
    chip.addEventListener('click', (e) => {
      if (e.target?.dataset?.del) {
        deletePreset(e.target.dataset.del);
        return;
      }
      applyPreset(p);
    });
    host.appendChild(chip);
  }
}

function updateOptionsPanel() {
  const panel = document.getElementById('tool-options');
  if (!S.pdfDoc) { panel.style.display = 'none'; return; }
  panel.style.display = '';

  const tool = S.activeTool;
  const sel  = S.annotations.find((a) => a.id === S.selectedId);
  const selCount = S.selectedAnnIds.length;

  const showStroke = ['rectangle','circle','line','arrow','ink'].includes(tool);
  const showFill   = ['rectangle','circle'].includes(tool);
  const showFont   = tool === 'freetext' || tool === 'textedit' || ['freetext','textedit'].includes(sel?.type);
  const showDelete = !!sel || selCount > 0;

  document.getElementById('opt-stroke-wrap').style.display = showStroke ? '' : 'none';
  document.getElementById('opt-fill-wrap').style.display   = showFill   ? '' : 'none';
  document.getElementById('opt-font-wrap').style.display   = showFont   ? '' : 'none';
  document.getElementById('btn-delete-ann').style.display  = showDelete  ? '' : 'none';

  const delBtn = document.getElementById('btn-delete-ann');
  if (delBtn) delBtn.textContent = selCount > 1 ? `🗑 ${selCount}件削除` : '🗑 削除';

  // 選択中注釈のオプション表示
  if (sel) {
    document.getElementById('color-custom').value = sel.color;
    document.getElementById('opt-opacity').value = sel.opacity;
    document.getElementById('opt-opacity-val').textContent = `${Math.round(sel.opacity * 100)}%`;
    if (sel.fontSize) document.getElementById('opt-fontsize').value = sel.fontSize;
    if (sel.fontColor) document.getElementById('opt-fontcolor').value = sel.fontColor;
  }
  renderPresetsUI();
}

function setActiveTool(tool) {
  // 進行中の操作をキャンセル
  if (marquee.el) { marquee.el.remove(); marquee.el = null; }
  marquee.active = false;
  drag.active = false;
  drag.ids = [];
  resize.active = false;
  S.activeTool  = tool;
  S.selectedId  = null;
  S.selectedAnnIds = [];
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  // 描画ツールごとのカーソル
  const viewer = document.getElementById('viewer');
  if (viewer) {
    viewer.classList.remove('tool-mode-select','tool-mode-rectangle','tool-mode-circle','tool-mode-line','tool-mode-arrow','tool-mode-freetext','tool-mode-textedit','tool-mode-ink','tool-mode-highlight','tool-mode-redaction');
    viewer.classList.add(`tool-mode-${tool}`);
  }
  renderAnnotationsAll();
  updateOptionsPanel();
  const labels = {
    select: '選択モード',
    rectangle: '矩形注釈',
    circle: '楕円注釈',
    line: '線注釈',
    arrow: '矢印注釈',
    freetext: 'テキスト注釈',
    textedit: '本文編集: 編集したい文字をクリック',
    ink: 'フリーハンド',
    highlight: 'ハイライト',
    redaction: '墨消し: 黒く塗りつぶす矩形を描きます（保存時に焼き込み）',
  };
  setStatus(labels[tool] || '準備完了');
}

// ============================================================
// Before / After 比較
// ============================================================

function setCompareMode(mode) {
  if (!S.pdfDoc) return;
  const next = mode === 'before' || mode === 'split' ? mode : 'off';
  if (S.compareMode === next) return;
  S.compareMode = next;
  S.compareTempActive = false;
  updateCompareUI();
  renderViewer();
  const labels = { off: 'After（編集後）を表示中', before: 'Before（元PDF）を表示中', split: '左右分割で比較中' };
  setStatus(labels[next]);
}

function toggleCompareMode() {
  if (!S.pdfDoc) return;
  // クリックは Before <-> After のトグル。split 中は Before へ落とす。
  const next = S.compareMode === 'before' ? 'off' : 'before';
  setCompareMode(next);
}

function setCompareDiff(on) {
  S.compareDiff = !!on;
  const cb = document.getElementById('compare-diff');
  if (cb) cb.checked = S.compareDiff;
  renderViewer();
}

function updateCompareUI() {
  const wrap = document.getElementById('compare-wrap');
  const btn = document.getElementById('btn-compare');
  if (!wrap || !btn) return;
  if (!S.pdfDoc) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';
  const showBefore = isShowingBefore();
  btn.classList.toggle('compare-active', S.compareMode !== 'off' || S.compareTempActive);
  btn.classList.toggle('compare-temp', S.compareTempActive);
  // メニュー内のアクティブ表示
  document.querySelectorAll('[data-compare-mode]').forEach((el) => {
    el.classList.toggle('active', el.dataset.compareMode === S.compareMode);
  });
  if (S.compareMode === 'split') btn.textContent = '⇄ 分割';
  else if (showBefore) btn.textContent = '⇄ Before';
  else btn.textContent = '⇄ 比較';
}

function maybeWarnNoBefore(pageId) {
  if (S.compareMode !== 'before') return;
  if (!hasBeforeForPage(pageId)) {
    showToast('このページは Before に対応する元PDFページがありません', 'info');
  }
}

// ============================================================
// 保存前プレビュー
// ============================================================

const saveModalState = {
  open: false,
  tab: 'after', // 'after' | 'before'
  orderIndex: 0,
  pdfDoc: null, // pdf.js doc for After preview (built from buildPdfBytes)
  building: false,
  afterBytes: null,
};

function openSavePreviewModal() {
  const modal = document.getElementById('save-modal');
  if (!modal) return;
  saveModalState.open = true;
  saveModalState.tab = 'after';
  saveModalState.orderIndex = Math.max(0, getCurrentOrderIndex());
  saveModalState.pdfDoc = null;
  saveModalState.afterBytes = null;
  modal.classList.remove('hidden');
  setSaveModalSection('preview');
  populateSaveModalControls();
  updateSaveModalTabs();
  renderSavePreview();
  buildSaveModalAfterDoc();
}

function closeSavePreviewModal() {
  const modal = document.getElementById('save-modal');
  if (!modal) return;
  saveModalState.open = false;
  modal.classList.add('hidden');
  // pdfjs doc を解放
  try { saveModalState.pdfDoc?.destroy?.(); } catch (_) { /* noop */ }
  saveModalState.pdfDoc = null;
  saveModalState.afterBytes = null;
}

async function buildSaveModalAfterDoc() {
  if (saveModalState.building) return;
  saveModalState.building = true;
  try {
    const opts = buildPdfOptionsFromSettings();
    const bytes = await buildPdfBytes(S.pageOrder.slice(), opts);
    saveModalState.afterBytes = bytes;
    saveModalState.pdfDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    if (saveModalState.open) renderSavePreview();
  } catch (err) {
    console.error(err);
    const host = document.getElementById('save-modal-preview');
    if (host) host.innerHTML = '<p class="save-modal-loading">プレビューの生成に失敗しました</p>';
  } finally {
    saveModalState.building = false;
  }
}

// UIの保存設定をbuildPdfBytes用のオプションへ変換する。
function buildPdfOptionsFromSettings() {
  const mode = S.saveSettings.mode || 'standard';
  return {
    flatten: mode === 'flatten',
    metadata: { ...S.saveSettings.metadata, keywords: parseKeywordsInput(S.saveSettings.metadata.keywords) },
  };
}

function invalidateAfterPreview() {
  // 設定が変わったので After プレビューを作り直す
  saveModalState.afterBytes = null;
  try { saveModalState.pdfDoc?.destroy?.(); } catch (_) { /* noop */ }
  saveModalState.pdfDoc = null;
  if (saveModalState.open && saveModalState.tab === 'after') {
    const host = document.getElementById('save-modal-preview');
    if (host) host.innerHTML = '<p class="save-modal-loading">プレビュー生成中...</p>';
  }
  buildSaveModalAfterDoc();
}

function updateSaveModalTabs() {
  document.querySelectorAll('.save-modal-tab').forEach((el) => {
    el.classList.toggle('active', el.dataset.tab === saveModalState.tab);
  });
  const label = document.getElementById('save-modal-page-label');
  if (label) label.textContent = `ページ ${saveModalState.orderIndex + 1} / ${S.pageOrder.length}`;
  const prev = document.getElementById('save-modal-prev');
  const next = document.getElementById('save-modal-next');
  if (prev) prev.disabled = saveModalState.orderIndex <= 0;
  if (next) next.disabled = saveModalState.orderIndex >= S.pageOrder.length - 1;
}

async function renderSavePreview() {
  updateSaveModalTabs();
  const host = document.getElementById('save-modal-preview');
  if (!host) return;
  host.innerHTML = '<p class="save-modal-loading">プレビュー生成中...</p>';
  const orderIndex = saveModalState.orderIndex;
  try {
    if (saveModalState.tab === 'before') {
      const pageId = S.pageOrder[orderIndex];
      if (!pageId || !hasBeforeForPage(pageId) || !S.originalPdfDoc) {
        host.innerHTML = '<p class="save-modal-loading">このページは Before に対応する元PDFがありません</p>';
        return;
      }
      const src = getPageSource(pageId);
      const page = await S.originalPdfDoc.getPage(src.sourceIndex + 1);
      const rotation = normalizeRotation(page.rotate || 0);
      const baseVp = page.getViewport({ scale: 1, rotation });
      const scale = Math.min(1.5, Math.max(0.5, 720 / baseVp.width));
      const vp = page.getViewport({ scale, rotation });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      host.innerHTML = '';
      host.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      page.cleanup();
    } else {
      // After: buildPdfBytes 結果の pdfjs doc から該当ページ
      if (!saveModalState.pdfDoc) {
        host.innerHTML = '<p class="save-modal-loading">After プレビュー生成中...</p>';
        return;
      }
      if (orderIndex >= saveModalState.pdfDoc.numPages) {
        host.innerHTML = '<p class="save-modal-loading">該当ページがありません</p>';
        return;
      }
      const page = await saveModalState.pdfDoc.getPage(orderIndex + 1);
      const rotation = normalizeRotation(page.rotate || 0);
      const baseVp = page.getViewport({ scale: 1, rotation });
      const scale = Math.min(1.5, Math.max(0.5, 720 / baseVp.width));
      const vp = page.getViewport({ scale, rotation });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      host.innerHTML = '';
      host.appendChild(canvas);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      page.cleanup();
    }
  } catch (err) {
    console.error(err);
    host.innerHTML = '<p class="save-modal-loading">プレビューの描画に失敗しました</p>';
  }
}

async function confirmSaveFromModal() {
  const mode = S.saveSettings.mode || 'standard';
  const tmpl = S.saveSettings.filenameTemplate || '{original}_edited';
  let closeAfter = true;
  try {
    const opts = buildPdfOptionsFromSettings();
    const bytes = saveModalState.afterBytes || await buildPdfBytes(S.pageOrder.slice(), opts);
    const pdfBlob = new Blob([bytes.buffer], { type: 'application/pdf' });
    const pdfName = renderFilename(tmpl, mode, 'pdf');
    await downloadBlob(pdfBlob, pdfName);

    if (mode === 'project') {
      const project = buildProjectJson();
      const jsonBlob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      const baseName = pdfName.replace(/\.pdf$/i, '');
      const jsonName = `${baseName}.pdf-edit.json`;
      await downloadBlob(jsonBlob, jsonName);
    }

    S.savedHistIdx = S.histIdx;
    setDirty(false);
    persistSaveSettings();
    const label = mode === 'flatten' ? 'フラット化PDFを書き出しました'
                : mode === 'project' ? 'PDF と編集情報(JSON)を書き出しました'
                : 'PDFを書き出しました';
    showToast(label, 'success');
  } catch (err) {
    console.error(err);
    closeAfter = false;
    showSaveErrorModal(err);
  } finally {
    if (closeAfter) closeSavePreviewModal();
  }
}

function pickPdfFile(fileInput) {
  if (!fileInput) return;
  try {
    if (typeof fileInput.showPicker === 'function') {
      fileInput.showPicker();
      return;
    }
  } catch (err) {
    console.warn('showPicker failed, falling back to click()', err);
  }
  fileInput.click();
}

function hasDraggedFiles(dataTransfer) {
  if (!dataTransfer?.types) return false;
  return Array.from(dataTransfer.types).includes('Files');
}

async function openPdfFile(file) {
  if (!file) return;
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    showToast('PDFファイルのみ対応しています', 'error');
    return;
  }
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('PDFファイルのみ対応しています', 'error');
    return;
  }

  if (S.pdfDoc && S.dirty) {
    const ok = window.confirm('未保存の変更があります。破棄して新しいPDFを開きますか？');
    if (!ok) {
      showToast('PDFの読み込みをキャンセルしました', 'info');
      return;
    }
  }

  setBusy(true, 'PDFを読み込み中...');
  try {
    await loadPdf(file);
  } catch (err) {
    console.error(err);
    showToast('PDFの読み込みに失敗しました', 'error');
  } finally {
    setBusy(false);
  }
}

// ============================================================
// PDF内検索
// ============================================================

// 全ページのテキスト位置を索引化する（初回検索時に構築）
async function buildSearchIndex() {
  if (!S.pdfDoc) return;
  if (S.searchIndex || S.searchIndexBuilding) return;
  S.searchIndexBuilding = true;
  const setStatusEl = document.getElementById('search-status');
  if (setStatusEl) setStatusEl.textContent = '索引を作成中…';
  const index = {};
  try {
    for (const pageId of S.pageOrder) {
      const src = getPageSource(pageId);
      if (src.kind === 'blank') {
        index[pageId] = [];
        continue;
      }
      let page;
      try {
        page = await resolveSourcePageForId(pageId);
      } catch (_) {
        index[pageId] = [];
        continue;
      }
      if (!page) { index[pageId] = []; continue; }
      try {
        const baseVp = page.getViewport({ scale: 1 });
        const content = await page.getTextContent();
        const dims = { width: baseVp.width, height: baseVp.height };
        S.pageDims[pageId] = S.pageDims[pageId] || dims;
        const items = [];
        for (const it of content.items) {
          const str = it.str || '';
          if (!str) continue;
          // ベクトル (transform) から PDF 座標系の rect を算出
          // pdf.js の transform: [a, b, c, d, e, f]; (e, f) は左下基準のPDF座標
          const tx = it.transform;
          const fontHeight = Math.max(6, Math.hypot(tx[2], tx[3]));
          const widthPdf = (it.width != null ? it.width : (str.length * fontHeight * 0.5));
          const x = tx[4];
          const y = tx[5];
          // PDF 座標で左下を (x, y), 高さ fontHeight
          items.push({
            text: str,
            rect: { x, y, width: Math.max(1, widthPdf), height: fontHeight * 1.05 },
            fontHeight,
          });
        }
        index[pageId] = items;
      } catch (err) {
        console.error('search index build failed for page', pageId, err);
        index[pageId] = [];
      } finally {
        try { page.cleanup?.(); } catch (_) { /* noop */ }
      }
    }
    S.searchIndex = index;
  } finally {
    S.searchIndexBuilding = false;
  }
  if (setStatusEl) setStatusEl.textContent = '0 / 0';
}

function clearSearchIndex() {
  S.searchIndex = null;
  S.searchIndexBuilding = false;
}

// 検索クエリを実行し、results を更新
function runSearch(query) {
  S.searchQuery = query || '';
  S.searchResults = [];
  S.searchActiveIndex = -1;
  if (!S.searchIndex || !S.searchQuery) {
    updateSearchStatus();
    renderSearchOverlaysAll();
    return;
  }
  const cs = !!S.searchCaseSensitive;
  const q = cs ? S.searchQuery : S.searchQuery.toLowerCase();
  for (const pageId of S.pageOrder) {
    const items = S.searchIndex[pageId] || [];
    items.forEach((item, idx) => {
      const hay = cs ? item.text : item.text.toLowerCase();
      let pos = 0;
      while (pos <= hay.length - q.length) {
        const at = hay.indexOf(q, pos);
        if (at === -1) break;
        S.searchResults.push({ pageId, itemIndex: idx, rect: item.rect });
        pos = at + Math.max(1, q.length);
      }
    });
  }
  if (S.searchResults.length > 0) S.searchActiveIndex = 0;
  updateSearchStatus();
  renderSearchOverlaysAll();
  if (S.searchActiveIndex >= 0) jumpToActiveSearchResult();
}

function updateSearchStatus() {
  const el = document.getElementById('search-status');
  if (!el) return;
  if (!S.searchQuery) {
    el.textContent = S.searchIndex ? '0 / 0' : '索引未作成';
    return;
  }
  if (!S.searchResults.length) {
    el.textContent = '0件';
    return;
  }
  el.textContent = `${S.searchActiveIndex + 1} / ${S.searchResults.length}`;
}

function jumpToActiveSearchResult() {
  const hit = S.searchResults[S.searchActiveIndex];
  if (!hit) return;
  // 該当ページにスクロール
  S.currentPage = hit.pageId;
  updatePageNav();
  updateThumbActive();
  if (S.viewMode === 'single') {
    renderViewer();
    // renderViewer 後にオーバーレイ更新
    setTimeout(() => renderSearchOverlaysAll(), 30);
  } else {
    const pw = document.querySelector(`.page-wrapper${pageDataSelector(hit.pageId)}`);
    if (pw) {
      // 該当ページが見えるようスクロール
      pw.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // アクティブハイライト更新
      renderSearchOverlaysAll();
    }
  }
}

function moveSearchActive(delta) {
  if (!S.searchResults.length) return;
  S.searchActiveIndex = (S.searchActiveIndex + delta + S.searchResults.length) % S.searchResults.length;
  updateSearchStatus();
  renderSearchOverlaysAll();
  jumpToActiveSearchResult();
}

// 単一ページに検索ハイライト用 SVG を描画
// 比較モード（split / before）では Before 側にはハイライトを付けない
function renderSearchOverlayForPage(pageId) {
  // 既存の同ページオーバーレイを除去
  const wrappers = Array.from(document.querySelectorAll(`.page-wrapper${pageDataSelector(pageId)}`));
  if (!wrappers.length) return;
  for (const w of wrappers) w.querySelectorAll('.search-overlay').forEach((el) => el.remove());
  if (!S.searchOpen || !S.searchQuery || !S.searchResults.length) return;
  const dims = S.pageDims[pageId];
  if (!dims) return;
  for (const wrapper of wrappers) {
    const variant = wrapper.dataset.variant;
    if (variant === 'before') continue; // Before 側にはハイライトを付けない
    const surface = wrapper.querySelector('.page-surface');
    const canvas = wrapper.querySelector('canvas');
    if (!canvas) continue;
    const width = canvas.width;
    const height = canvas.height;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.classList.add('search-overlay');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    S.searchResults.forEach((hit, idx) => {
      if (hit.pageId !== pageId) return;
      const cr = pdfRectToCanvas(hit.rect, dims, S.zoom);
      const rectEl = document.createElementNS(ns, 'rect');
      rectEl.setAttribute('x', cr.x - 1);
      rectEl.setAttribute('y', cr.y - 1);
      rectEl.setAttribute('width', Math.max(1, cr.width + 2));
      rectEl.setAttribute('height', Math.max(1, cr.height + 2));
      const isActive = idx === S.searchActiveIndex;
      rectEl.setAttribute('class', isActive ? 'search-hit-active' : 'search-hit');
      svg.appendChild(rectEl);
    });
    if (svg.children.length) (surface || wrapper).appendChild(svg);
  }
}

// 全ヒットページに検索ハイライト用 SVG を描画
function renderSearchOverlaysAll() {
  document.querySelectorAll('.search-overlay').forEach((el) => el.remove());
  if (!S.searchOpen || !S.searchQuery || !S.searchResults.length) return;
  const pageIds = new Set(S.searchResults.map((h) => h.pageId));
  for (const pageId of pageIds) renderSearchOverlayForPage(pageId);
}

function openSearchBar() {
  if (!S.pdfDoc) return;
  const bar = document.getElementById('search-bar');
  const input = document.getElementById('search-input');
  if (!bar) return;
  S.searchOpen = true;
  bar.classList.remove('hidden');
  // 索引を遅延構築
  if (!S.searchIndex && !S.searchIndexBuilding) {
    buildSearchIndex().then(() => {
      if (S.searchOpen && S.searchQuery) runSearch(S.searchQuery);
      else updateSearchStatus();
    });
  } else {
    updateSearchStatus();
  }
  // 既にクエリがあれば再実行（インデックス作成後にも有効）
  if (S.searchQuery && S.searchIndex) runSearch(S.searchQuery);
  if (input) {
    input.value = S.searchQuery || '';
    setTimeout(() => { input.focus(); input.select(); }, 30);
  }
  renderSearchOverlaysAll();
}

function closeSearchBar() {
  const bar = document.getElementById('search-bar');
  if (bar) bar.classList.add('hidden');
  S.searchOpen = false;
  // ハイライトをクリア（結果データは残す）
  document.querySelectorAll('.search-overlay').forEach((el) => el.remove());
}

// ============================================================
// 右クリックメニュー
// ============================================================

let contextMenuEl = null;

function addContextMenuItem(parent, label, action, disabled = false) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'context-menu-item';
  btn.textContent = label;
  btn.disabled = disabled;
  // 別項目へ移動した場合だけサブメニューを閉じ、内部操作では維持する。
  btn.addEventListener('mouseenter', () => {
    if (parent === contextMenuEl) closeContextSubmenu();
  });
  btn.addEventListener('click', () => {
    hideContextMenu();
    if (!disabled) action();
  });
  parent.appendChild(btn);
}

function addContextMenuDivider(parent) {
  const div = document.createElement('div');
  div.className = 'context-menu-divider';
  parent.appendChild(div);
}

// 階層メニューの表示位置と開閉を共通管理する。
let contextSubmenuEl = null;
let contextSubmenuOpener = null;

function buildSubmenuBuilder(items) {
  // items: [{ kind:'item', label, action, disabled } | { kind:'divider' }]
  return (parent) => {
    for (const it of items) {
      if (!it) continue;
      if (it.kind === 'divider') addContextMenuDivider(parent);
      else addContextMenuItem(parent, it.label, it.action, !!it.disabled);
    }
  };
}

function addContextSubmenuItem(parent, label, items) {
  const filtered = items.filter(Boolean);
  if (!filtered.length) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'context-menu-item has-submenu';
  btn.textContent = label;
  btn.addEventListener('mouseenter', () => openContextSubmenu(btn, filtered));
  btn.addEventListener('focus', () => openContextSubmenu(btn, filtered));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    openContextSubmenu(btn, filtered);
  });
  parent.appendChild(btn);
}

function openContextSubmenu(opener, items) {
  closeContextSubmenu();
  contextSubmenuOpener = opener;
  contextSubmenuEl = document.createElement('div');
  contextSubmenuEl.className = 'context-submenu';
  buildSubmenuBuilder(items)(contextSubmenuEl);
  document.body.appendChild(contextSubmenuEl);
  // 位置: 親項目の右側 / 画面端で左にフリップ
  const rect = opener.getBoundingClientRect();
  const sw = contextSubmenuEl.offsetWidth;
  const sh = contextSubmenuEl.offsetHeight;
  let left = rect.right - 2;
  if (left + sw > window.innerWidth - 8) left = Math.max(8, rect.left - sw + 2);
  let top = rect.top;
  if (top + sh > window.innerHeight - 8) top = Math.max(8, window.innerHeight - sh - 8);
  contextSubmenuEl.style.left = `${left}px`;
  contextSubmenuEl.style.top = `${top}px`;
}

function closeContextSubmenu() {
  if (contextSubmenuEl) {
    contextSubmenuEl.remove();
    contextSubmenuEl = null;
  }
  contextSubmenuOpener = null;
}

function showContextMenu(x, y, ctx = {}) {
  hideContextMenu();
  if (!contextMenuEl) {
    contextMenuEl = document.createElement('div');
    contextMenuEl.id = 'context-menu';
    contextMenuEl.className = 'context-menu hidden';
    document.body.appendChild(contextMenuEl);
  }

  const fileInput = document.getElementById('file-input');
  const mergeInput = document.getElementById('file-input-merge');
  const pageId = ctx.pageId ?? S.currentPage;
  const orderIndex = S.pageOrder.indexOf(pageId);
  // 対象ページ群: 右クリック対象が複数選択に含まれていればまとめて、そうでなければ単一
  const targetIds = (S.selectedIds.length > 1 && S.selectedIds.includes(pageId))
    ? S.selectedIds.slice()
    : [pageId];
  const multi = targetIds.length > 1;
  contextMenuEl.innerHTML = '';

  // ファイル系（トップ階層）
  addContextMenuItem(contextMenuEl, 'PDFを開く', () => pickPdfFile(fileInput));
  addContextMenuItem(contextMenuEl, '保存', () => {
    if (!S.pdfDoc) return;
    openSavePreviewModal();
  }, !S.pdfDoc);
  addContextMenuItem(contextMenuEl, 'PDF内を検索 (Ctrl+F)', openSearchBar, !S.pdfDoc);

  // 編集（Undo/Redo + クリップボード）
  addContextMenuDivider(contextMenuEl);
  addContextSubmenuItem(contextMenuEl, '編集', [
    { kind: 'item', label: '元に戻す (Ctrl+Z)', action: undo, disabled: S.histIdx <= 0 },
    { kind: 'item', label: 'やり直す (Ctrl+Y)', action: redo, disabled: S.histIdx >= S.history.length - 1 },
    { kind: 'divider' },
    { kind: 'item', label: 'コピー (Ctrl+C)', action: copySelectedAnnotations, disabled: !(S.selectedAnnIds.length || S.selectedId) },
    { kind: 'item', label: '貼り付け (Ctrl+V)', action: pasteAnnotations, disabled: S.clipboard.length === 0 },
  ]);

  // ページ操作
  if (S.pdfDoc && orderIndex !== -1) {
    addContextSubmenuItem(contextMenuEl, 'ページ操作', [
      { kind: 'item', label: multi ? `${targetIds.length}ページを左に回転` : 'ページを左に回転', action: () => rotatePage(pageId, -90) },
      { kind: 'item', label: multi ? `${targetIds.length}ページを右に回転` : 'ページを右に回転', action: () => rotatePage(pageId, 90) },
      { kind: 'divider' },
      { kind: 'item', label: multi ? `${targetIds.length}ページを削除` : 'ページを削除', action: () => deletePages(targetIds), disabled: S.pageOrder.length - targetIds.length < 1 },
      { kind: 'item', label: multi ? `${targetIds.length}ページを複製` : 'ページを複製', action: () => duplicatePages(targetIds) },
      { kind: 'item', label: '白紙ページを前に挿入', action: () => insertBlankPage(orderIndex) },
      { kind: 'item', label: '白紙ページを後ろに挿入', action: () => insertBlankPage(orderIndex + 1) },
      { kind: 'divider' },
      { kind: 'item', label: multi ? '選択ページを抽出して保存' : 'このページを抽出して保存', action: () => extractPages(targetIds) },
      { kind: 'item', label: 'ページを前へ移動', action: () => movePageTo(pageId, orderIndex - 1), disabled: multi || orderIndex <= 0 },
      { kind: 'item', label: 'ページを後ろへ移動', action: () => movePageTo(pageId, orderIndex + 1), disabled: multi || orderIndex >= S.pageOrder.length - 1 },
      { kind: 'item', label: multi ? `${targetIds.length}ページを先頭へ` : 'ページを先頭へ', action: () => movePagesToEdge(targetIds, false) },
      { kind: 'item', label: multi ? `${targetIds.length}ページを末尾へ` : 'ページを末尾へ', action: () => movePagesToEdge(targetIds, true) },
      { kind: 'divider' },
      { kind: 'item', label: '別PDFを結合', action: () => pickPdfFile(mergeInput) },
    ]);
  }

  // 注釈操作
  const hasAnnSel = S.selectedAnnIds.length > 0 || !!S.selectedId;
  const multiAnn = S.selectedAnnIds.length;
  if (hasAnnSel) {
    const annLabel = multiAnn > 1 ? `${multiAnn}件の注釈を削除` : '選択中の注釈を削除';
    const items = [
      { kind: 'item', label: annLabel, action: () => {
        if (multiAnn > 1) deleteAnnotations(S.selectedAnnIds.slice());
        else if (S.selectedId) deleteAnnotation(S.selectedId);
      }},
      { kind: 'item', label: multiAnn > 1 ? `${multiAnn}件をコピー` : '注釈をコピー', action: () => copySelectedAnnotations() },
      { kind: 'item', label: 'ここに貼り付け', action: () => pasteAnnotations(), disabled: S.clipboard.length === 0 },
    ];
    addContextSubmenuItem(contextMenuEl, '注釈', items);

    addContextSubmenuItem(contextMenuEl, '前面 / 背面', [
      { kind: 'item', label: '最前面へ', action: () => reorderSelectedAnnotations('front') },
      { kind: 'item', label: '一つ前へ', action: () => reorderSelectedAnnotations('forward') },
      { kind: 'item', label: '一つ後ろへ', action: () => reorderSelectedAnnotations('backward') },
      { kind: 'item', label: '最背面へ', action: () => reorderSelectedAnnotations('back') },
    ]);

    if (multiAnn >= 2) {
      const align = [
        { kind: 'item', label: '左揃え', action: () => alignSelectedAnnotations('left') },
        { kind: 'item', label: '中央揃え（水平）', action: () => alignSelectedAnnotations('hcenter') },
        { kind: 'item', label: '右揃え', action: () => alignSelectedAnnotations('right') },
        { kind: 'item', label: '上揃え', action: () => alignSelectedAnnotations('top') },
        { kind: 'item', label: '中央揃え（垂直）', action: () => alignSelectedAnnotations('vcenter') },
        { kind: 'item', label: '下揃え', action: () => alignSelectedAnnotations('bottom') },
      ];
      if (multiAnn >= 3) {
        align.push({ kind: 'divider' });
        align.push({ kind: 'item', label: '横方向に等間隔', action: () => alignSelectedAnnotations('hdistribute') });
        align.push({ kind: 'item', label: '縦方向に等間隔', action: () => alignSelectedAnnotations('vdistribute') });
      }
      addContextSubmenuItem(contextMenuEl, '整列', align);
    }
  } else if (S.clipboard.length > 0) {
    addContextMenuItem(contextMenuEl, 'ここに貼り付け', () => pasteAnnotations());
  }

  // 挿入ツール
  if (S.pdfDoc) {
    addContextSubmenuItem(contextMenuEl, '挿入', [
      { kind: 'item', label: '画像を挿入', action: () => pickPdfFile(document.getElementById('file-input-image')) },
      { kind: 'item', label: '署名を挿入', action: () => { renderSignatureList(); openModal('signature-modal'); } },
      { kind: 'item', label: 'スタンプを挿入', action: () => { renderStampList(); openModal('stamp-modal'); } },
      { kind: 'item', label: 'QRコードを挿入', action: () => openQrModal() },
      { kind: 'divider' },
      { kind: 'item', label: '透かしを編集', action: () => openWatermarkModal() },
      { kind: 'item', label: 'ページ番号を編集', action: () => openPageNumberModal() },
      { kind: 'item', label: 'ヘッダー / フッターを編集', action: () => openHeaderFooterModal() },
    ]);
  }

  // ツール切替
  addContextSubmenuItem(contextMenuEl, 'ツール切替', [
    { kind: 'item', label: '選択 (V)', action: () => setActiveTool('select'), disabled: !S.pdfDoc },
    { kind: 'item', label: '本文編集 (E)', action: () => setActiveTool('textedit'), disabled: !S.pdfDoc },
    { kind: 'item', label: 'テキスト (T)', action: () => setActiveTool('freetext'), disabled: !S.pdfDoc },
    { kind: 'item', label: 'ペン (I)', action: () => setActiveTool('ink'), disabled: !S.pdfDoc },
    { kind: 'item', label: 'ハイライト (H)', action: () => setActiveTool('highlight'), disabled: !S.pdfDoc },
    { kind: 'item', label: '墨消し (B)', action: () => setActiveTool('redaction'), disabled: !S.pdfDoc },
    { kind: 'divider' },
    { kind: 'item', label: '四角 (R)', action: () => setActiveTool('rectangle'), disabled: !S.pdfDoc },
    { kind: 'item', label: '円 (C)', action: () => setActiveTool('circle'), disabled: !S.pdfDoc },
    { kind: 'item', label: '線 (L)', action: () => setActiveTool('line'), disabled: !S.pdfDoc },
    { kind: 'item', label: '矢印 (A)', action: () => setActiveTool('arrow'), disabled: !S.pdfDoc },
  ]);

  addContextMenuDivider(contextMenuEl);
  addContextMenuItem(contextMenuEl, 'ショートカット一覧 (?)', openShortcutsModal);

  contextMenuEl.classList.remove('hidden');
  const rect = contextMenuEl.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  contextMenuEl.style.left = `${Math.max(8, left)}px`;
  contextMenuEl.style.top = `${Math.max(8, top)}px`;
}

function hideContextMenu() {
  if (contextMenuEl) contextMenuEl.classList.add('hidden');
  closeContextSubmenu();
}

// ============================================================
// DOMイベントの接続
// ============================================================

function init() {
  // ファイル開く
  const fileInput = document.getElementById('file-input');
  document.getElementById('btn-open').addEventListener('click', () => pickPdfFile(fileInput));
  fileInput.addEventListener('change', async (e) => {
    await openPdfFile(e.target.files?.[0]);
    e.target.value = '';
  });

  // 保存前モーダルで最終確認してから書き出す。
  document.getElementById('btn-save').addEventListener('click', () => {
    if (!S.pdfDoc) return;
    openSavePreviewModal();
  });

  // 保存前プレビュー
  document.getElementById('save-modal-close').addEventListener('click', closeSavePreviewModal);
  document.getElementById('save-modal-cancel').addEventListener('click', closeSavePreviewModal);
  document.getElementById('save-modal-confirm').addEventListener('click', async () => {
    setBusy(true, 'PDFを書き出し中...');
    try { await confirmSaveFromModal(); }
    finally { setBusy(false); }
  });
  document.querySelectorAll('.save-modal-tab').forEach((el) => {
    el.addEventListener('click', () => {
      saveModalState.tab = el.dataset.tab;
      renderSavePreview();
    });
  });
  document.getElementById('save-modal-prev').addEventListener('click', () => {
    if (saveModalState.orderIndex > 0) {
      saveModalState.orderIndex--;
      renderSavePreview();
    }
  });
  document.getElementById('save-modal-next').addEventListener('click', () => {
    if (saveModalState.orderIndex < S.pageOrder.length - 1) {
      saveModalState.orderIndex++;
      renderSavePreview();
    }
  });
  document.getElementById('save-modal').addEventListener('click', (e) => {
    if (e.target.id === 'save-modal') closeSavePreviewModal();
  });

  // 保存モーダルのセクションタブ
  document.querySelectorAll('.save-modal-section').forEach((el) => {
    el.addEventListener('click', () => setSaveModalSection(el.dataset.section));
  });

  // 保存モード
  document.querySelectorAll('input[name="save-mode"]').forEach((el) => {
    el.addEventListener('change', () => {
      if (!el.checked) return;
      S.saveSettings.mode = el.value;
      persistSaveSettings();
      renderFilenamePreview();
      // flatten 切替で出力が変わるため After プレビューを作り直す
      invalidateAfterPreview();
    });
  });

  // ファイル名テンプレート
  const tmplInput = document.getElementById('save-filename-template');
  if (tmplInput) {
    tmplInput.addEventListener('input', () => {
      S.saveSettings.filenameTemplate = tmplInput.value;
      renderFilenamePreview();
    });
    tmplInput.addEventListener('change', () => {
      persistSaveSettings();
    });
  }

  // メタデータ入力
  const metaWires = [
    ['meta-title', 'title'],
    ['meta-author', 'author'],
    ['meta-subject', 'subject'],
    ['meta-producer', 'producer'],
    ['meta-creator', 'creator'],
  ];
  for (const [id, key] of metaWires) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener('input', () => {
      S.saveSettings.metadata[key] = el.value;
      S.saveSettings.metadataUserEdited[key] = true;
    });
    el.addEventListener('change', () => persistSaveSettings());
  }
  const metaKwEl = document.getElementById('meta-keywords');
  if (metaKwEl) {
    metaKwEl.addEventListener('input', () => {
      S.saveSettings.metadata.keywords = parseKeywordsInput(metaKwEl.value);
      S.saveSettings.metadataUserEdited.keywords = true;
    });
    metaKwEl.addEventListener('change', () => persistSaveSettings());
  }

  // エラーモーダル
  document.getElementById('save-error-close')?.addEventListener('click', closeSaveErrorModal);
  document.getElementById('save-error-dismiss')?.addEventListener('click', closeSaveErrorModal);
  document.getElementById('save-error-copy')?.addEventListener('click', copySaveErrorToClipboard);
  document.getElementById('save-error-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'save-error-modal') closeSaveErrorModal();
  });

  // プロジェクト復元
  const restoreInput = document.getElementById('file-input-project');
  const btnRestore = document.getElementById('btn-restore-project');
  if (btnRestore) btnRestore.disabled = true;
  btnRestore?.addEventListener('click', () => {
    if (!S.pdfDoc) {
      showToast('先に対応する PDF を開いてください', 'info');
      return;
    }
    if (S.dirty) {
      const ok = window.confirm('未保存の変更があります。プロジェクトを復元すると現在の編集内容は失われます。続行しますか？');
      if (!ok) return;
    }
    pickPdfFile(restoreInput);
  });
  restoreInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!S.pdfDoc) {
      showToast('先に対応する PDF を開いてください', 'info');
      return;
    }
    try {
      const text = await file.text();
      const project = JSON.parse(text);
      const beforeCount = Array.isArray(project.pageOrder) ? project.pageOrder.length : 0;
      applyProjectJson(project);
      const dropped = beforeCount - S.pageOrder.length;
      refreshPageStructure('プロジェクトを復元しました');
      renderAnnotationsAll();
      updateUndoRedo();
      updateOptionsPanel();
      updatePageEditButtons();
      updateCompareUI?.();
      document.getElementById('page-total').textContent = `/ ${S.totalPages}`;
      setDirty(false);
      if (dropped > 0) {
        showToast(`プロジェクトを復元しました（結合元PDFが見つからない${dropped}ページは除外）`, 'success', 4200);
      } else {
        showToast('プロジェクトを復元しました', 'success');
      }
    } catch (err) {
      console.error(err);
      showToast(`復元に失敗しました: ${err?.message || err}`, 'error');
    }
  });

  // 比較ボタン
  const btnCompare = document.getElementById('btn-compare');
  const btnCompareMenu = document.getElementById('btn-compare-menu');
  const compareMenu = document.getElementById('compare-menu');
  // 長押し（pointerdown 中）で一時 Before。クリックは Before / After のトグル。
  let longPressTimer = null;
  let longPressFired = false;
  btnCompare.addEventListener('click', () => {
    if (!S.pdfDoc) return;
    if (longPressFired) { longPressFired = false; return; }
    toggleCompareMode();
    if (S.compareMode === 'before') maybeWarnNoBefore(S.currentPage);
  });
  const startTempBefore = (e) => {
    if (!S.pdfDoc) return;
    if (e.target.closest('#compare-menu')) return;
    if (S.compareMode !== 'off') return;
    longPressFired = false;
    longPressTimer = setTimeout(() => {
      longPressFired = true;
      S.compareTempActive = true;
      updateCompareUI();
      renderViewer();
      maybeWarnNoBefore(S.currentPage);
    }, 180);
  };
  const endTempBefore = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
    if (S.compareTempActive) {
      S.compareTempActive = false;
      updateCompareUI();
      renderViewer();
    }
  };
  btnCompare.addEventListener('pointerdown', startTempBefore);
  btnCompare.addEventListener('pointerup', endTempBefore);
  btnCompare.addEventListener('pointerleave', endTempBefore);
  btnCompare.addEventListener('pointercancel', endTempBefore);
  // メニュー
  btnCompareMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    compareMenu.classList.toggle('hidden');
  });
  document.querySelectorAll('[data-compare-mode]').forEach((el) => {
    el.addEventListener('click', () => {
      setCompareMode(el.dataset.compareMode);
      compareMenu.classList.add('hidden');
      if (S.compareMode === 'before') maybeWarnNoBefore(S.currentPage);
    });
  });
  document.getElementById('compare-diff').addEventListener('change', (e) => {
    setCompareDiff(e.target.checked);
  });
  // メニュー外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!compareMenu.classList.contains('hidden') && !e.target.closest('#compare-wrap')) {
      compareMenu.classList.add('hidden');
    }
  });

  // ページ操作
  document.getElementById('btn-prev').addEventListener('click', () => {
    goToOrderIndex(getCurrentOrderIndex() - 1);
  });
  document.getElementById('btn-next').addEventListener('click', () => {
    goToOrderIndex(getCurrentOrderIndex() + 1);
  });
  document.getElementById('page-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = parseInt(e.target.value, 10);
    if (isNaN(v) || v < 1 || v > S.pageOrder.length) return;
    goToOrderIndex(v - 1);
  });

  // ページ編集・結合・抽出
  const mergeInput = document.getElementById('file-input-merge');
  document.getElementById('btn-merge').addEventListener('click', () => pickPdfFile(mergeInput));
  mergeInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await mergePdfFile(file);
  });
  document.getElementById('btn-extract').addEventListener('click', () => {
    const targets = S.selectedIds.length > 0 ? S.selectedIds.slice() : [S.currentPage];
    extractPages(targets);
  });
  document.getElementById('btn-page-duplicate').addEventListener('click', () => {
    if (!S.pdfDoc) return;
    const targets = S.selectedIds.length > 0 ? S.selectedIds.slice() : [S.currentPage];
    duplicatePages(targets);
  });
  document.getElementById('btn-page-delete').addEventListener('click', () => {
    if (!S.pdfDoc) return;
    const targets = S.selectedIds.length > 0 ? S.selectedIds.slice() : [S.currentPage];
    deletePages(targets);
  });
  document.getElementById('btn-page-blank').addEventListener('click', () => {
    if (!S.pdfDoc) return;
    const sel = S.selectedIds.filter((id) => S.pageOrder.indexOf(id) !== -1);
    const orderIdx = sel.length > 0
      ? Math.max(...sel.map((id) => S.pageOrder.indexOf(id))) + 1
      : getCurrentOrderIndex() + 1;
    insertBlankPage(orderIdx);
  });
  document.getElementById('btn-page-first').addEventListener('click', () => {
    if (!S.pdfDoc) return;
    const targets = S.selectedIds.length > 0 ? S.selectedIds.slice() : [S.currentPage];
    movePagesToEdge(targets, false);
  });
  document.getElementById('btn-page-last').addEventListener('click', () => {
    if (!S.pdfDoc) return;
    const targets = S.selectedIds.length > 0 ? S.selectedIds.slice() : [S.currentPage];
    movePagesToEdge(targets, true);
  });

  // ズーム
  const zoomSteps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];
  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    const i = zoomSteps.findIndex((z) => z >= S.zoom);
    S.zoom = zoomSteps[Math.max(0, i - 1)];
    S.fitMode = null;
    document.getElementById('zoom-select').value = S.zoom;
    renderViewer();
  });
  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    const i = zoomSteps.findIndex((z) => z > S.zoom);
    if (i !== -1) { S.zoom = zoomSteps[i]; S.fitMode = null; document.getElementById('zoom-select').value = S.zoom; renderViewer(); }
  });
  document.getElementById('zoom-select').addEventListener('change', (e) => {
    S.zoom = parseFloat(e.target.value);
    S.fitMode = null;
    renderViewer();
  });

  document.getElementById('btn-fit-page').addEventListener('click', () => applyFit('page'));
  document.getElementById('btn-fit-width').addEventListener('click', () => applyFit('width'));
  document.getElementById('btn-rotate-left').addEventListener('click', () => rotatePage(S.currentPage, -90));
  document.getElementById('btn-rotate-right').addEventListener('click', () => rotatePage(S.currentPage, 90));

  // 表示モード
  document.getElementById('btn-single').addEventListener('click', () => {
    S.viewMode = 'single';
    document.getElementById('btn-single').classList.add('active');
    document.getElementById('btn-continuous').classList.remove('active');
    renderViewer();
  });
  document.getElementById('btn-continuous').addEventListener('click', () => {
    S.viewMode = 'continuous';
    document.getElementById('btn-continuous').classList.add('active');
    document.getElementById('btn-single').classList.remove('active');
    renderViewer();
  });

  // ツール
  document.querySelectorAll('.tool-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveTool(btn.dataset.tool));
  });

  // Undo / Redo
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);

  // ツールオプション
  document.getElementById('opt-opacity').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    document.getElementById('opt-opacity-val').textContent = `${Math.round(v * 100)}%`;
    S.toolOptions.opacity = v;
    applyToSelected({ opacity: v });
  });

  document.getElementById('color-custom').addEventListener('input', (e) => {
    S.toolOptions.color = e.target.value;
    document.querySelectorAll('.preset').forEach((p) => p.classList.remove('active'));
    applyToSelected({ color: e.target.value });
  });

  document.querySelectorAll('.preset').forEach((p) => {
    p.addEventListener('click', () => {
      const c = p.dataset.color;
      S.toolOptions.color = c;
      document.getElementById('color-custom').value = c;
      document.querySelectorAll('.preset').forEach((q) => q.classList.toggle('active', q === p));
      applyToSelected({ color: c });
    });
  });

  document.getElementById('opt-stroke').addEventListener('change', (e) => {
    S.toolOptions.strokeWidth = parseInt(e.target.value, 10);
    applyToSelected({ strokeWidth: S.toolOptions.strokeWidth });
  });

  document.getElementById('opt-fill').addEventListener('change', (e) => {
    S.toolOptions.fillColor = e.target.checked ? S.toolOptions.color : null;
    applyToSelected({ fillColor: S.toolOptions.fillColor });
  });

  document.getElementById('opt-fontsize').addEventListener('change', (e) => {
    S.toolOptions.fontSize = parseInt(e.target.value, 10);
    applyToSelected({ fontSize: S.toolOptions.fontSize });
  });

  document.getElementById('opt-fontcolor').addEventListener('input', (e) => {
    S.toolOptions.fontColor = e.target.value;
    applyToSelected({ fontColor: e.target.value });
  });

  // 注釈プリセットの保存・適用
  const presetSaveBtn = document.getElementById('btn-preset-save');
  if (presetSaveBtn) {
    presetSaveBtn.addEventListener('click', () => savePresetFromCurrent());
  }
  loadPresets();
  renderPresetsUI();
  // PDF固有でない保存設定だけをlocalStorageから復元する。
  loadSaveSettings();

  document.getElementById('btn-delete-ann').addEventListener('click', () => {
    if (S.selectedAnnIds.length > 1) {
      deleteAnnotations(S.selectedAnnIds.slice());
    } else if (S.selectedId) {
      deleteAnnotation(S.selectedId);
    }
  });

  // 挿入メニュー
  loadSignatures();
  loadStamps();
  const insertBtn = document.getElementById('btn-insert');
  const insertMenu = document.getElementById('insert-menu');
  if (insertBtn && insertMenu) {
    insertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!S.pdfDoc) {
        showToast('まず PDF を開いてください', 'info');
        return;
      }
      insertMenu.classList.toggle('hidden');
    });
    insertMenu.querySelectorAll('[data-insert]').forEach((el) => {
      el.addEventListener('click', () => {
        insertMenu.classList.add('hidden');
        const kind = el.dataset.insert;
        if (!S.pdfDoc) return;
        switch (kind) {
          case 'image': pickPdfFile(document.getElementById('file-input-image')); break;
          case 'signature': renderSignatureList(); openModal('signature-modal'); break;
          case 'stamp': renderStampList(); openModal('stamp-modal'); break;
          case 'qrcode': openQrModal(); break;
          case 'watermark': openWatermarkModal(); break;
          case 'pagenumber': openPageNumberModal(); break;
          case 'headerfooter': openHeaderFooterModal(); break;
        }
      });
    });
    document.addEventListener('click', (e) => {
      if (!insertMenu.classList.contains('hidden') && !e.target.closest('.insert-group')) {
        insertMenu.classList.add('hidden');
      }
    });
  }
  // 画像挿入ファイル
  const imgInput = document.getElementById('file-input-image');
  imgInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('画像ファイルを選択してください', 'error'); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await insertImageAnnotation(dataUrl, file.type, { type: 'image' });
    } catch (err) {
      console.error(err);
      showToast('画像の読み込みに失敗しました', 'error');
    }
  });
  // 署名追加
  const sigInput = document.getElementById('file-input-signature');
  document.getElementById('btn-signature-add')?.addEventListener('click', () => pickPdfFile(sigInput));
  sigInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('画像ファイルを選択してください', 'error'); return; }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      addSignatureFromDataUrl(dataUrl, file.name.replace(/\.[^.]+$/, ''));
      showToast('署名を登録しました', 'success', 1600);
    } catch (err) {
      console.error(err);
      showToast('署名の読み込みに失敗しました', 'error');
    }
  });
  // モーダル閉じる
  document.querySelectorAll('.phase4-modal-close, [data-close]').forEach((el) => {
    const id = el.dataset.close || el.closest('.phase4-modal')?.id;
    if (!id) return;
    el.addEventListener('click', () => closeModal(id));
  });
  document.querySelectorAll('.phase4-modal').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
  // スタンプ追加
  document.getElementById('btn-stamp-add')?.addEventListener('click', () => {
    const text = (document.getElementById('stamp-new-text').value || '').trim();
    if (!text) { showToast('スタンプのテキストを入力してください', 'error'); return; }
    const color = document.getElementById('stamp-new-color').value || '#e53e3e';
    const borderColor = document.getElementById('stamp-new-border').value || color;
    const strokeWidth = parseFloat(document.getElementById('stamp-new-stroke').value) || 2;
    const fontSize = parseInt(document.getElementById('stamp-new-fontsize').value, 10) || 32;
    addStamp({ text, color, borderColor, strokeWidth, fontSize });
    document.getElementById('stamp-new-text').value = '';
    showToast('スタンプを登録しました', 'success', 1600);
  });
  // 透かしモーダル
  document.getElementById('wm-opacity')?.addEventListener('input', (e) => {
    document.getElementById('wm-opacity-val').textContent = `${Math.round(parseFloat(e.target.value) * 100)}%`;
  });
  document.getElementById('wm-apply')?.addEventListener('click', applyWatermarkFromModal);
  // ページ番号モーダル
  document.getElementById('pn-format')?.addEventListener('change', (e) => {
    document.getElementById('pn-format-custom').style.display = e.target.value === 'custom' ? '' : 'none';
  });
  document.getElementById('pn-apply')?.addEventListener('click', applyPageNumberFromModal);
  // ヘッダーフッターモーダル
  document.getElementById('hf-apply')?.addEventListener('click', applyHeaderFooterFromModal);
  // QR モーダル
  ['qr-text','qr-fg','qr-bg','qr-ec'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', renderQrPreview);
    document.getElementById(id)?.addEventListener('change', renderQrPreview);
  });
  document.getElementById('qr-apply')?.addEventListener('click', applyQrFromModal);

  // 検索バー
  const searchInput = document.getElementById('search-input');
  const searchCase = document.getElementById('search-case');
  const btnSearch = document.getElementById('btn-search');
  const btnSearchPrev = document.getElementById('btn-search-prev');
  const btnSearchNext = document.getElementById('btn-search-next');
  const btnSearchClose = document.getElementById('btn-search-close');
  if (btnSearch) btnSearch.addEventListener('click', openSearchBar);
  if (btnSearchClose) btnSearchClose.addEventListener('click', () => closeSearchBar());
  if (btnSearchPrev) btnSearchPrev.addEventListener('click', () => moveSearchActive(-1));
  if (btnSearchNext) btnSearchNext.addEventListener('click', () => moveSearchActive(1));
  if (searchInput) {
    let searchTimer = null;
    searchInput.addEventListener('input', (e) => {
      const v = e.target.value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (!S.searchIndex) {
          // 索引未完成: 入力値を保持して索引完成後に検索される
          S.searchQuery = v;
          updateSearchStatus();
          return;
        }
        runSearch(v);
      }, 180);
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) moveSearchActive(-1);
        else moveSearchActive(1);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchBar();
      }
    });
  }
  if (searchCase) {
    searchCase.addEventListener('change', (e) => {
      S.searchCaseSensitive = !!e.target.checked;
      if (S.searchIndex && S.searchQuery) runSearch(S.searchQuery);
    });
  }

  document.addEventListener('contextmenu', (e) => {
    if (!document.getElementById('app').contains(e.target)) return;
    e.preventDefault();
    const annEl = e.target.closest('[data-ann-id]');
    const pageEl = e.target.closest('.page-wrapper, .ann-svg, .thumb-item');
    const rawId = pageEl?.dataset?.page;
    const pageId = rawId != null ? parsePageId(rawId) : S.currentPage;
    if (annEl) {
      // 右クリック対象が既選択集合に含まれていなければ単独選択へ
      if (!S.selectedAnnIds.includes(annEl.dataset.annId)) {
        setSelectedAnnIds([annEl.dataset.annId]);
      }
      renderAnnotationsAll();
      updateOptionsPanel();
    }
    if (pageId != null) {
      S.currentPage = pageId;
      // サムネで右クリックした場合: 対象が選択外なら単独選択へ
      if (pageEl?.classList?.contains('thumb-item') && !S.selectedIds.includes(pageId)) {
        S.selectedIds = [pageId];
        S.selectionAnchor = pageId;
        updateThumbActive();
        updatePageEditButtons();
      }
    }
    updatePageNav();
    updateThumbActive();
    showContextMenu(e.clientX, e.clientY, { pageId, annId: annEl?.dataset.annId });
  });
  document.addEventListener('click', hideContextMenu);
  document.addEventListener('scroll', hideContextMenu, true);

  // カスタマイズ可能なキーボードショートカット
  window.addEventListener('keydown', handleShortcutKeydown);

  // 未保存変更がある場合の離脱警告
  window.addEventListener('beforeunload', (e) => {
    if (!S.dirty) return;
    e.preventDefault();
    e.returnValue = '';
    return '';
  });

  // ドラッグ&ドロップ
  let dragCounter = 0;
  document.addEventListener('dragenter', (e) => {
    e.preventDefault();
    if (!hasDraggedFiles(e.dataTransfer)) return;
    dragCounter++;
    document.getElementById('drop-overlay').classList.remove('hidden');
  });
  document.addEventListener('dragleave', (e) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    dragCounter--; if (dragCounter === 0) document.getElementById('drop-overlay').classList.add('hidden');
  });
  document.addEventListener('dragover', (e) => {
    if (!hasDraggedFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('drop', async (e) => {
    e.preventDefault(); dragCounter = 0; document.getElementById('drop-overlay').classList.add('hidden');
    const file = e.dataTransfer?.files[0];
    await openPdfFile(file);
  });
}

// ============================================================
// ショートカット定義とカスタマイズ
// ============================================================

const SHORTCUT_STORAGE_KEY = 'pdf-editor-shortcuts';
const THUMB_WIDTH_STORAGE_KEY = 'pdf-editor-thumbnail-width';

// 各アクションの実行ハンドラ
const SHORTCUT_ACTIONS = {
  'undo':              { label: '元に戻す', category: 'edit', requiresPdf: false, handler: () => undo() },
  'redo':              { label: 'やり直す', category: 'edit', requiresPdf: false, handler: () => redo() },
  'copy':              { label: '注釈をコピー', category: 'edit', requiresPdf: true, handler: () => { if (S.selectedAnnIds.length || S.selectedId) copySelectedAnnotations(); } },
  'paste':             { label: '注釈を貼り付け', category: 'edit', requiresPdf: true, handler: () => { if (S.clipboard.length) pasteAnnotations(); } },
  'select-all-pages':  { label: '全ページ選択', category: 'edit', requiresPdf: true, handler: () => {
    if (!S.pdfDoc) return;
    S.selectedIds = S.pageOrder.slice();
    S.selectionAnchor = S.pageOrder[0];
    updateThumbActive();
    updatePageEditButtons();
  }},
  'find':              { label: 'PDF内検索', category: 'view', requiresPdf: true, handler: () => { if (S.pdfDoc) openSearchBar(); } },
  'save':              { label: '保存', category: 'file', requiresPdf: true, handler: () => { if (S.pdfDoc) openSavePreviewModal(); } },
  'open':              { label: 'PDFを開く', category: 'file', requiresPdf: false, handler: () => pickPdfFile(document.getElementById('file-input')) },
  'help':              { label: 'ショートカット一覧', category: 'other', requiresPdf: false, handler: () => openShortcutsModal() },
  'tool-select':       { label: 'ツール: 選択', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('select'); } },
  'tool-rectangle':    { label: 'ツール: 矩形', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('rectangle'); } },
  'tool-circle':       { label: 'ツール: 楕円', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('circle'); } },
  'tool-line':         { label: 'ツール: 線', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('line'); } },
  'tool-arrow':        { label: 'ツール: 矢印', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('arrow'); } },
  'tool-freetext':     { label: 'ツール: テキスト注釈', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('freetext'); } },
  'tool-textedit':     { label: 'ツール: 本文編集', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('textedit'); } },
  'tool-ink':          { label: 'ツール: ペン', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('ink'); } },
  'tool-highlight':    { label: 'ツール: ハイライト', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('highlight'); } },
  'tool-redaction':    { label: 'ツール: 墨消し', category: 'tool', requiresPdf: true, handler: () => { if (S.pdfDoc) setActiveTool('redaction'); } },
};

const SHORTCUT_CATEGORIES = [
  ['file', 'ファイル'],
  ['edit', '編集'],
  ['view', '表示 / 検索'],
  ['tool', 'ツール'],
  ['other', 'その他'],
];

// キー定義: { key, ctrl, shift, alt } のうち key は 1 文字 or 'Delete'/'Escape' など
const DEFAULT_SHORTCUTS = {
  'undo':              { key: 'z', ctrl: true,  shift: false, alt: false },
  'redo':              { key: 'y', ctrl: true,  shift: false, alt: false },
  'copy':              { key: 'c', ctrl: true,  shift: false, alt: false },
  'paste':             { key: 'v', ctrl: true,  shift: false, alt: false },
  'select-all-pages':  { key: 'a', ctrl: true,  shift: false, alt: false },
  'find':              { key: 'f', ctrl: true,  shift: false, alt: false },
  'save':              { key: 's', ctrl: true,  shift: false, alt: false },
  'open':              { key: 'o', ctrl: true,  shift: false, alt: false },
  'help':              { key: '?', ctrl: false, shift: true,  alt: false },
  'tool-select':       { key: 'v', ctrl: false, shift: false, alt: false },
  'tool-rectangle':    { key: 'r', ctrl: false, shift: false, alt: false },
  'tool-circle':       { key: 'c', ctrl: false, shift: false, alt: false },
  'tool-line':         { key: 'l', ctrl: false, shift: false, alt: false },
  'tool-arrow':        { key: 'a', ctrl: false, shift: false, alt: false },
  'tool-freetext':     { key: 't', ctrl: false, shift: false, alt: false },
  'tool-textedit':     { key: 'e', ctrl: false, shift: false, alt: false },
  'tool-ink':          { key: 'i', ctrl: false, shift: false, alt: false },
  'tool-highlight':    { key: 'h', ctrl: false, shift: false, alt: false },
  'tool-redaction':    { key: 'b', ctrl: false, shift: false, alt: false },
};

let userShortcuts = {};   // { actionId: keyDef }
let shortcutCapture = null; // { actionId, rowEl, keyEl }

function getShortcut(actionId) {
  return userShortcuts[actionId] || DEFAULT_SHORTCUTS[actionId] || null;
}

function loadShortcuts() {
  try {
    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    for (const [id, def] of Object.entries(parsed)) {
      if (DEFAULT_SHORTCUTS[id] && def && typeof def === 'object' && typeof def.key === 'string') {
        userShortcuts[id] = {
          key: def.key,
          ctrl: !!def.ctrl,
          shift: !!def.shift,
          alt: !!def.alt,
        };
      }
    }
  } catch (err) {
    console.warn('loadShortcuts failed', err);
  }
}

function persistShortcuts() {
  try {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(userShortcuts));
  } catch (err) {
    console.warn('persistShortcuts failed', err);
  }
}

function shortcutLabel(def) {
  if (!def || !def.key) return '（未割当）';
  const parts = [];
  if (def.ctrl) parts.push(navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl');
  if (def.alt) parts.push('Alt');
  if (def.shift) parts.push('Shift');
  let key = def.key;
  if (key.length === 1) key = key.toUpperCase();
  parts.push(key);
  return parts.join(' + ');
}

function eventMatchesShortcut(e, def) {
  if (!def || !def.key) return false;
  const ctrl = e.ctrlKey || e.metaKey;
  if (!!def.ctrl !== ctrl) return false;
  if (!!def.alt !== e.altKey) return false;
  // shift は記号キー（?）の場合は問わない場合もあるが、デフォルトは厳密照合
  if (!!def.shift !== e.shiftKey) return false;
  // key 比較: 1 文字なら大文字小文字を無視
  if (def.key.length === 1) {
    return e.key.toLowerCase() === def.key.toLowerCase();
  }
  return e.key === def.key;
}

function isInputField(target) {
  if (!target) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

function handleShortcutKeydown(e) {
  // ショートカットキャプチャ中は最優先で処理
  if (shortcutCapture) {
    handleShortcutCapture(e);
    return;
  }

  const inField = isInputField(document.activeElement);

  // Escape は常に処理（既存挙動）
  if (e.key === 'Escape') {
    hideContextMenu();
    if (!document.getElementById('shortcuts-modal')?.classList.contains('hidden')) {
      closeShortcutsModal();
      return;
    }
    if (S.searchOpen) {
      closeSearchBar();
      return;
    }
    if (S.selectedAnnIds.length || S.selectedId) {
      setSelectedAnnIds([]);
      renderAnnotationsAll();
      updateOptionsPanel();
    }
    if (S.selectedIds.length) {
      S.selectedIds = [];
      S.selectionAnchor = null;
      updateThumbActive();
      updatePageEditButtons();
    }
    return;
  }

  // Delete/Backspace は既存ロジックを保持
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (inField) return;
    if (S.selectedAnnIds.length > 1) {
      deleteAnnotations(S.selectedAnnIds.slice());
    } else if (S.selectedId) {
      deleteAnnotation(S.selectedId);
    } else if (S.pdfDoc && document.activeElement?.closest?.('#thumbnail-panel')) {
      const targets = S.selectedIds.length > 0 ? S.selectedIds.slice() : [S.currentPage];
      deletePages(targets);
    }
    return;
  }

  // Ctrl+Shift+Z は redo の慣用シノニム（カスタマイズ対象外）
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    redo();
    return;
  }

  // 登録済ショートカットを上から照合（Ctrl 付きを優先）
  // Ctrl 付き → 単押しの順
  const ordered = Object.keys(SHORTCUT_ACTIONS).sort((a, b) => {
    const da = getShortcut(a), db = getShortcut(b);
    return (db?.ctrl ? 1 : 0) - (da?.ctrl ? 1 : 0);
  });
  for (const actionId of ordered) {
    const def = getShortcut(actionId);
    if (!def) continue;
    if (!eventMatchesShortcut(e, def)) continue;
    // 単押し（Ctrl/Alt なし）は入力欄では発火させない
    const isPlain = !def.ctrl && !def.alt;
    if (isPlain && inField) continue;
    // 入力欄ではブラウザ標準のコピー/貼り付け/全選択を妨げない
    if (inField && (actionId === 'copy' || actionId === 'paste')) continue;
    // select-all-pages はサムネルフォーカス or body フォーカス時のみ。入力欄では Ctrl+A は標準動作を残す
    if (actionId === 'select-all-pages') {
      if (inField) continue;
      const ok = document.activeElement === document.body || document.activeElement?.closest?.('#thumbnail-panel');
      if (!ok) continue;
    }
    const meta = SHORTCUT_ACTIONS[actionId];
    if (meta.requiresPdf && !S.pdfDoc) continue;
    e.preventDefault();
    try { meta.handler(); } catch (err) { console.error(err); }
    return;
  }
}

function handleShortcutCapture(e) {
  e.preventDefault();
  e.stopPropagation();
  if (e.key === 'Escape') {
    cancelShortcutCapture();
    return;
  }
  // 修飾キー単独は無視
  if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;
  const def = {
    key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  };
  // 競合チェック（同じアクションは除外）
  for (const [otherId, otherDef] of Object.entries({ ...DEFAULT_SHORTCUTS, ...userShortcuts })) {
    if (otherId === shortcutCapture.actionId) continue;
    const cur = getShortcut(otherId);
    if (cur && cur.key === def.key && !!cur.ctrl === !!def.ctrl && !!cur.shift === !!def.shift && !!cur.alt === !!def.alt) {
      shortcutCapture.keyEl.classList.add('conflict');
      shortcutCapture.keyEl.textContent = `${shortcutLabel(def)}（${SHORTCUT_ACTIONS[otherId]?.label || otherId} と競合）`;
      showToast(`${shortcutLabel(def)} は「${SHORTCUT_ACTIONS[otherId]?.label || otherId}」に既に割り当てられています`, 'error', 2200);
      cancelShortcutCapture();
      return;
    }
  }
  userShortcuts[shortcutCapture.actionId] = def;
  persistShortcuts();
  cancelShortcutCapture();
  renderShortcutsList();
  showToast(`${SHORTCUT_ACTIONS[shortcutCapture?.actionId]?.label || ''} を ${shortcutLabel(def)} に変更しました`, 'success', 1800);
}

function cancelShortcutCapture() {
  if (shortcutCapture) {
    shortcutCapture.keyEl?.classList.remove('capturing', 'conflict');
  }
  shortcutCapture = null;
  renderShortcutsList();
}

function openShortcutsModal() {
  renderShortcutsList();
  openModal('shortcuts-modal');
}

function closeShortcutsModal() {
  cancelShortcutCapture();
  closeModal('shortcuts-modal');
}

function renderShortcutsList() {
  const root = document.getElementById('shortcuts-list');
  if (!root) return;
  root.innerHTML = '';
  for (const [catId, catLabel] of SHORTCUT_CATEGORIES) {
    const section = document.createElement('div');
    section.className = 'shortcuts-section';
    const h = document.createElement('h3');
    h.textContent = catLabel;
    section.appendChild(h);
    for (const [actionId, meta] of Object.entries(SHORTCUT_ACTIONS)) {
      if (meta.category !== catId) continue;
      const def = getShortcut(actionId);
      const row = document.createElement('div');
      row.className = 'shortcuts-row';
      const lbl = document.createElement('div');
      lbl.className = 'sc-label';
      lbl.textContent = meta.label;
      const key = document.createElement('div');
      key.className = 'sc-key';
      key.textContent = shortcutLabel(def);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sc-edit';
      btn.textContent = (shortcutCapture?.actionId === actionId) ? 'キーを押す…' : '変更';
      if (shortcutCapture?.actionId === actionId) key.classList.add('capturing');
      btn.addEventListener('click', () => {
        if (shortcutCapture?.actionId === actionId) {
          cancelShortcutCapture();
          return;
        }
        cancelShortcutCapture();
        shortcutCapture = { actionId, rowEl: row, keyEl: key };
        renderShortcutsList();
      });
      row.appendChild(lbl);
      row.appendChild(key);
      row.appendChild(btn);
      section.appendChild(row);
    }
    root.appendChild(section);
  }
}

function resetShortcutsToDefault() {
  if (!window.confirm('ショートカットを初期設定に戻しますか？')) return;
  userShortcuts = {};
  try { localStorage.removeItem(SHORTCUT_STORAGE_KEY); } catch (_) { /* noop */ }
  cancelShortcutCapture();
  renderShortcutsList();
  showToast('ショートカットを初期設定に戻しました', 'success', 1600);
}

// ============================================================
// ページ番号をドラッグ調整するためのオーバーレイ
// ============================================================

function refreshPageNumberOverlays() {
  document.querySelectorAll('.page-wrapper').forEach((wrapper) => {
    const id = parsePageId(wrapper.dataset.page);
    if (id != null) renderPageNumberOverlay(wrapper, id);
  });
}

function renderPageNumberOverlay(wrapper, pageId) {
  // Before 表示中は非表示
  const surface = wrapper.querySelector('.page-surface');
  const old = (surface || wrapper).querySelector(':scope > .page-number-overlay');
  if (old) old.remove();
  const variant = wrapper.dataset.variant;
  if (variant === 'before') return;
  const pn = S.pageNumberConfig;
  if (!pn?.enabled) return;
  const orderIndex = getPageOrderIndex(pageId);
  const total = S.pageOrder.length;
  const from = Math.max(1, pn.fromPage || 1);
  if (orderIndex + 1 < from) return;
  const n = (pn.start ?? 1) + (orderIndex + 1 - from);
  const fmt = pn.format === 'custom' ? (pn.customFormat || '{n}/{total}') : pn.format;
  const txt = String(fmt || '').replace(/\{n\}/g, n).replace(/\{total\}/g, total);
  if (!txt) return;
  // PDF 元寸法（surface 内座標で配置するので回転前のサイズを使う）
  const dims = S.pageDims[pageId];
  if (!dims || !surface) return;
  const pw = dims.width;
  const ph = dims.height;
  const fontSize = pn.fontSize || 11;
  const measured = measureTextSize(txt, fontSize);
  const w = measured.width;
  const h = measured.height;
  const margin = Math.max(12, fontSize * 1.2);
  let bx = margin, by = margin;
  switch (pn.position) {
    case 'tl': bx = margin; by = ph - margin - h; break;
    case 'tc': bx = pw / 2 - w / 2; by = ph - margin - h; break;
    case 'tr': bx = pw - margin - w; by = ph - margin - h; break;
    case 'bl': bx = margin; by = margin; break;
    case 'bc': bx = pw / 2 - w / 2; by = margin; break;
    case 'br': bx = pw - margin - w; by = margin; break;
  }
  bx += pn.offsetX || 0;
  by += pn.offsetY || 0;
  // PDF 座標 (左下原点) → surface CSS 座標 (左上原点)
  const cssX = bx * S.zoom;
  const cssY = (ph - by - h) * S.zoom;
  const overlay = document.createElement('div');
  overlay.className = 'page-number-overlay';
  overlay.textContent = txt;
  overlay.style.left = `${cssX}px`;
  overlay.style.top = `${cssY}px`;
  overlay.style.fontSize = `${fontSize * S.zoom}px`;
  overlay.style.color = pn.color || '#1a202c';
  overlay.title = 'ドラッグで位置を微調整できます';
  overlay.dataset.page = pageId;
  attachPageNumberDrag(overlay, pageId);
  surface.appendChild(overlay);
}

function attachPageNumberDrag(overlay, pageId) {
  let dragging = false;
  let startClientX = 0, startClientY = 0;
  let startOffsetX = 0, startOffsetY = 0;
  let rot = 0;
  overlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging = true;
    overlay.classList.add('dragging');
    startClientX = e.clientX;
    startClientY = e.clientY;
    startOffsetX = S.pageNumberConfig.offsetX || 0;
    startOffsetY = S.pageNumberConfig.offsetY || 0;
    rot = getPageRotation(pageId);
    overlay.setPointerCapture(e.pointerId);
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    // クライアント座標差を回転を考慮して PDF 座標差へ変換
    const cdx = (e.clientX - startClientX) / S.zoom;
    const cdy = (e.clientY - startClientY) / S.zoom;
    let dx, dy;
    switch (rot % 360) {
      case 90:  dx =  cdy; dy =  cdx; break;
      case 180: dx = -cdx; dy =  cdy; break;
      case 270: dx = -cdy; dy = -cdx; break;
      default:  dx =  cdx; dy = -cdy; break;
    }
    S.pageNumberConfig.offsetX = Math.round(startOffsetX + dx);
    S.pageNumberConfig.offsetY = Math.round(startOffsetY + dy);
    refreshPageNumberOverlays();
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    overlay.classList.remove('dragging');
    try { overlay.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    pushHistory();
    updateUndoRedo();
    showToast(`ページ番号オフセット: X ${S.pageNumberConfig.offsetX} / Y ${S.pageNumberConfig.offsetY}`, 'info', 1400);
  }
  overlay.addEventListener('pointerup', endDrag);
  overlay.addEventListener('pointercancel', endDrag);
}

// ============================================================
// サムネイル幅のリサイズ
// ============================================================

function loadThumbnailWidth() {
  try {
    const raw = localStorage.getItem(THUMB_WIDTH_STORAGE_KEY);
    if (!raw) return;
    const w = parseInt(raw, 10);
    if (!Number.isFinite(w) || w < 80 || w > 600) return;
    document.documentElement.style.setProperty('--thumb-w', `${w}px`);
    const panel = document.getElementById('thumbnail-panel');
    if (panel) panel.style.width = `${w}px`;
  } catch (err) {
    console.warn('loadThumbnailWidth failed', err);
  }
}

function persistThumbnailWidth(width) {
  try { localStorage.setItem(THUMB_WIDTH_STORAGE_KEY, String(width)); }
  catch (err) { console.warn('persistThumbnailWidth failed', err); }
}

function setupThumbResizer() {
  const resizer = document.getElementById('thumb-resizer');
  const panel = document.getElementById('thumbnail-panel');
  if (!resizer || !panel) return;
  let dragging = false;
  let startX = 0;
  let startWidth = 0;
  resizer.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    resizer.classList.add('dragging');
    resizer.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const next = Math.min(600, Math.max(96, startWidth + (e.clientX - startX)));
    panel.style.width = `${next}px`;
    document.documentElement.style.setProperty('--thumb-w', `${next}px`);
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    try { resizer.releasePointerCapture(e.pointerId); } catch (_) { /* noop */ }
    document.body.style.cursor = '';
    persistThumbnailWidth(Math.round(panel.getBoundingClientRect().width));
  }
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
}

// ============================================================
// ズーム前後で表示中心がずれないようスクロール位置を補正する。
// ============================================================

function setZoomKeepingCenter(nextZoom, anchor) {
  const viewer = document.getElementById('viewer');
  if (!viewer || !S.pdfDoc) {
    S.zoom = nextZoom;
    document.getElementById('zoom-select').value = String(S.zoom);
    renderViewer();
    return;
  }
  const prev = S.zoom;
  if (!prev || !nextZoom || prev === nextZoom) {
    S.zoom = nextZoom;
    document.getElementById('zoom-select').value = String(S.zoom);
    renderViewer();
    return;
  }
  const ratio = nextZoom / prev;
  const rect = viewer.getBoundingClientRect();
  // anchor を viewer 内座標で取得（指定されなければ中央）
  let anchorX = rect.width / 2;
  let anchorY = rect.height / 2;
  if (anchor && Number.isFinite(anchor.clientX) && Number.isFinite(anchor.clientY)) {
    anchorX = anchor.clientX - rect.left;
    anchorY = anchor.clientY - rect.top;
  }
  const prevScrollLeft = viewer.scrollLeft;
  const prevScrollTop = viewer.scrollTop;
  // anchor 位置のコンテンツ座標
  const contentX = prevScrollLeft + anchorX;
  const contentY = prevScrollTop + anchorY;
  S.zoom = nextZoom;
  document.getElementById('zoom-select').value = String(S.zoom);
  renderViewer();
  // renderViewer は同期で innerHTML を構築するためスクロール量はその場で復元できる
  const nextContentX = contentX * ratio;
  const nextContentY = contentY * ratio;
  viewer.scrollLeft = Math.max(0, nextContentX - anchorX);
  viewer.scrollTop = Math.max(0, nextContentY - anchorY);
}

function setupZoomKeepCenter() {
  const viewer = document.getElementById('viewer');
  if (!viewer) return;
  // 最後にビューア上で動いたマウス位置を保持して Ctrl+ホイール / ボタンズームのアンカーに使う
  const lastPointer = { clientX: NaN, clientY: NaN };
  viewer.addEventListener('pointermove', (e) => {
    lastPointer.clientX = e.clientX;
    lastPointer.clientY = e.clientY;
  });
  // Ctrl + ホイールでズーム（マウス位置を中心に維持）
  viewer.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!S.pdfDoc) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const steps = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];
    const i = steps.findIndex((z) => Math.abs(z - S.zoom) < 0.001);
    let next;
    if (dir > 0) next = steps[Math.min(steps.length - 1, (i === -1 ? steps.findIndex((z) => z >= S.zoom) : i) + 1)];
    else next = steps[Math.max(0, (i === -1 ? Math.max(0, steps.findIndex((z) => z > S.zoom) - 1) : i - 1))];
    if (next == null || next === S.zoom) return;
    S.fitMode = null;
    setZoomKeepingCenter(next, { clientX: e.clientX, clientY: e.clientY });
  }, { passive: false });
  // 既存のズームボタン/select を中心維持版に置き換える
  const zoomSteps = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0];
  const btnOut = document.getElementById('btn-zoom-out');
  const btnIn = document.getElementById('btn-zoom-in');
  const sel = document.getElementById('zoom-select');
  if (btnOut) {
    btnOut.replaceWith(btnOut.cloneNode(true));
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
      if (!S.pdfDoc) return;
      const i = zoomSteps.findIndex((z) => z >= S.zoom);
      const next = zoomSteps[Math.max(0, i - 1)];
      S.fitMode = null;
      setZoomKeepingCenter(next, Number.isFinite(lastPointer.clientX) ? lastPointer : null);
    });
  }
  if (btnIn) {
    btnIn.replaceWith(btnIn.cloneNode(true));
    document.getElementById('btn-zoom-in').addEventListener('click', () => {
      if (!S.pdfDoc) return;
      const i = zoomSteps.findIndex((z) => z > S.zoom);
      if (i === -1) return;
      S.fitMode = null;
      setZoomKeepingCenter(zoomSteps[i], Number.isFinite(lastPointer.clientX) ? lastPointer : null);
    });
  }
  if (sel) {
    sel.replaceWith(sel.cloneNode(true));
    document.getElementById('zoom-select').addEventListener('change', (e) => {
      const next = parseFloat(e.target.value);
      S.fitMode = null;
      setZoomKeepingCenter(next, Number.isFinite(lastPointer.clientX) ? lastPointer : null);
    });
  }
}

// ============================================================
// 初期化フック
// ============================================================

function initPhase7() {
  loadShortcuts();
  loadThumbnailWidth();
  setupThumbResizer();
  setupZoomKeepCenter();
  // ショートカット一覧ボタン
  document.getElementById('btn-shortcuts')?.addEventListener('click', openShortcutsModal);
  document.getElementById('shortcuts-reset')?.addEventListener('click', resetShortcutsToDefault);
  // モーダル外クリックで閉じる
  document.getElementById('shortcuts-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'shortcuts-modal') closeShortcutsModal();
  });
  // close ボタン経由でもキャプチャ状態を確実にリセット
  document.querySelectorAll('#shortcuts-modal [data-close="shortcuts-modal"]').forEach((el) => {
    el.addEventListener('click', cancelShortcutCapture);
  });
  // ページ番号オフセットのリセット
  document.getElementById('pn-offset-reset')?.addEventListener('click', () => {
    const offX = document.getElementById('pn-offset-x');
    const offY = document.getElementById('pn-offset-y');
    if (offX) offX.value = 0;
    if (offY) offY.value = 0;
  });
}

try {
  init();
  initPhase7();
  window.pdfEditorBooted = true;
  document.getElementById('startup-error')?.classList.add('hidden');
} catch (err) {
  console.error(err);
  window.pdfEditorBooted = false;
  throw err;
}
