/* store.js — 軽量状態管理。EventTarget を継承し、`change` を発火する。
 * UI 側は store.subscribe(fn) で購読、store.update(patch) で更新する。 */

const STORAGE_KEY = 'xnh-svg-conv:state';

const DEFAULT_STATE = Object.freeze({
  // ファイル
  source: null, // { name, type, width, height, imageBitmap }
  brushDirty: 0, // ブラシキャンバスに描き込みがあるたびインクリメント（リアクティブ更新用）
  // 出力
  svg: null, // string
  svgMeta: null, // { bytes, nodes }
  palette: null, // 直近のカラートレースで使ったパレット（[r,g,b][]）
  // モード
  mode: 'outline', // 'outline' | 'centerline' | 'edges' | 'color' | 'binary' | 'silhouette'
  // 前処理
  preprocess: {
    brightness: 0, // -100..100
    contrast: 0, // -100..100
    gamma: 1.0, // 0.2..3.0
    blur: 0, // 0..5 px
    threshold: 128, // 0..255 (binary mode)
    autoThreshold: true,
    saturation: 0, // -100..100  彩度
    hueRotate: 0, // -180..180  色相回転
    invert: false,
    sepia: false,
  },
  // トレースパラメータ
  trace: {
    simplify: 1.0, // path tolerance
    smoothing: 0.7, // 0..1
    speckle: 4, // min area
    cornerThreshold: 100, // 0..180 deg
    colors: 8, // 2..32 (color mode)
    strokeWidth: 0, // 0=fill mode
    thinning: true, // edges/centerline モードで Zhang-Suen 細線化を行うか
  },
  // UI 状態
  ui: {
    locale: 'ja', // 'ja' | 'en'
    theme: 'auto', // 'auto' | 'light' | 'dark'
    busy: false,
    progress: 0,
    statusKey: 'status.idle',
    liveTrace: false, // パラメータ変更時に自動で再トレースするか
    exportFormat: 'svg', // 'svg' | 'svgz' | 'png' | 'jpeg' | 'webp' | 'pdf'
    sizeTemplate: 'native', // 'native' | 'square-512' | 'square-1024' | 'icon-128' | 'instagram-1080' | 'twitter-1500x500' | 'youtube-1280x720' | 'a4'
    brushTool: 'none', // 'none' | 'paint' (黒塗り) | 'erase' (白塗り)
    brushSize: 16, // px (元画像基準)
    brushHardness: 0.85, // 0..1
  },
  // パレット差し替え（color モードのみ反映）
  paletteOverride: null, // { '#原色': '#新色', ... }
});

class Store extends EventTarget {
  /** @type {typeof DEFAULT_STATE} */
  state;
  /** @type {Array<{ mode, preprocess, trace }>} */
  #undoStack = [];
  /** @type {Array<{ mode, preprocess, trace }>} */
  #redoStack = [];
  #snapshotTimer = 0;

  constructor() {
    super();
    this.state = structuredClone(DEFAULT_STATE);
    this.#loadPersisted();
  }

  /** Shallow-merge a patch into a section, or top-level if no section.
   *  Examples:
   *    store.update({ mode: 'binary' })
   *    store.update({ preprocess: { brightness: 10 } })
   */
  update(patch) {
    let changed = false;
    let userParamsTouched = false;
    for (const [k, v] of Object.entries(patch)) {
      const prev = this.state[k];
      if (v !== null && typeof v === 'object' && !Array.isArray(v) && prev && typeof prev === 'object') {
        const next = { ...prev, ...v };
        if (!shallowEqual(prev, next)) {
          this.state = { ...this.state, [k]: next };
          changed = true;
          if (k === 'preprocess' || k === 'trace') userParamsTouched = true;
        }
      } else if (prev !== v) {
        this.state = { ...this.state, [k]: v };
        changed = true;
        if (k === 'mode') userParamsTouched = true;
      }
    }
    if (changed) {
      if (userParamsTouched) this.#scheduleSnapshot();
      this.#persist();
      this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
    }
  }

  #scheduleSnapshot() {
    // 連続変更（スライダドラッグなど）は 350ms 区切りで 1 つにまとめる
    if (this.#snapshotTimer) return;
    this.#snapshotTimer = setTimeout(() => {
      this.#snapshotTimer = 0;
      this.#pushUndo();
    }, 350);
  }

  #pushUndo() {
    const { mode, preprocess, trace } = this.state;
    const snap = { mode, preprocess: { ...preprocess }, trace: { ...trace } };
    const top = this.#undoStack[this.#undoStack.length - 1];
    if (top && shallowSnapEqual(top, snap)) return;
    this.#undoStack.push(snap);
    if (this.#undoStack.length > 100) this.#undoStack.shift();
    this.#redoStack.length = 0;
  }

  undo() {
    if (this.#undoStack.length < 2) return false;
    const cur = this.#undoStack.pop();
    this.#redoStack.push(cur);
    const target = this.#undoStack[this.#undoStack.length - 1];
    this.#applySnapshot(target);
    return true;
  }

  redo() {
    const target = this.#redoStack.pop();
    if (!target) return false;
    this.#undoStack.push(target);
    this.#applySnapshot(target);
    return true;
  }

  #applySnapshot(snap) {
    this.state = {
      ...this.state,
      mode: snap.mode,
      preprocess: { ...snap.preprocess },
      trace: { ...snap.trace },
    };
    this.#persist();
    this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
  }

  canUndo() { return this.#undoStack.length > 1; }
  canRedo() { return this.#redoStack.length > 0; }

  /** Subscribe to state changes. Returns unsubscribe fn. */
  subscribe(handler) {
    const wrapped = (event) => handler(event.detail);
    this.addEventListener('change', wrapped);
    handler(this.state);
    return () => this.removeEventListener('change', wrapped);
  }

  reset() {
    this.state = structuredClone(DEFAULT_STATE);
    this.#persist();
    this.dispatchEvent(new CustomEvent('change', { detail: this.state }));
  }

  #persist() {
    try {
      const { ui, mode, preprocess, trace } = this.state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ui, mode, preprocess, trace }));
    } catch {
      /* private mode / quota */
    }
  }

  #loadPersisted() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        this.state = {
          ...this.state,
          ...data,
          ui: { ...this.state.ui, ...(data.ui ?? {}) },
          preprocess: { ...this.state.preprocess, ...(data.preprocess ?? {}) },
          trace: { ...this.state.trace, ...(data.trace ?? {}) },
        };
      }
    } catch {
      /* ignore corrupt */
    }
  }
}

function shallowEqual(a, b) {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

function shallowSnapEqual(a, b) {
  return (
    a.mode === b.mode &&
    shallowEqual(a.preprocess, b.preprocess) &&
    shallowEqual(a.trace, b.trace)
  );
}

export const store = new Store();
