/* ui/controls.js — モード選択 / 前処理スライダ / トレースパラメータ / プリセットを描画。 */

import { store } from '../store.js';
import { t } from '../i18n/index.js';

const MODES = ['outline', 'centerline', 'edges', 'color', 'binary', 'silhouette'];

const PREPROCESS_FIELDS = [
  { key: 'brightness', kind: 'range', min: -100, max: 100, step: 1 },
  { key: 'contrast', kind: 'range', min: -100, max: 100, step: 1 },
  { key: 'gamma', kind: 'range', min: 0.2, max: 3.0, step: 0.05 },
  { key: 'saturation', kind: 'range', min: -100, max: 100, step: 1 },
  { key: 'hueRotate', kind: 'range', min: -180, max: 180, step: 1 },
  { key: 'blur', kind: 'range', min: 0, max: 5, step: 0.1 },
  { key: 'invert', kind: 'toggle' },
  { key: 'sepia', kind: 'toggle' },
  { key: 'autoThreshold', kind: 'toggle' },
  { key: 'threshold', kind: 'range', min: 0, max: 255, step: 1, disabledBy: 'autoThreshold' },
];

const TRACE_FIELDS = [
  { key: 'simplify', kind: 'range', min: 0, max: 5, step: 0.1 },
  { key: 'smoothing', kind: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'speckle', kind: 'range', min: 0, max: 32, step: 1 },
  { key: 'cornerThreshold', kind: 'range', min: 0, max: 180, step: 1 },
  { key: 'colors', kind: 'range', min: 2, max: 32, step: 1 },
  { key: 'strokeWidth', kind: 'range', min: 0, max: 10, step: 0.1 },
  { key: 'thinning', kind: 'toggle', onlyForModes: ['edges', 'centerline'] },
];

const PRESETS = [
  {
    id: 'logo',
    label: 'Logo',
    apply: {
      mode: 'outline',
      preprocess: { autoThreshold: true, blur: 0 },
      trace: { simplify: 1, smoothing: 0.8, speckle: 8, strokeWidth: 0 },
    },
  },
  {
    id: 'sketch',
    label: 'Sketch',
    apply: {
      mode: 'edges',
      preprocess: { autoThreshold: false, threshold: 96, blur: 0.5 },
      trace: { simplify: 0.5, smoothing: 0.5, speckle: 2, strokeWidth: 1.2 },
    },
  },
  {
    id: 'photo',
    label: 'Photo',
    apply: {
      mode: 'color',
      preprocess: { blur: 0.5 },
      trace: { colors: 12, simplify: 1.2, smoothing: 0.6, speckle: 4 },
    },
  },
  {
    id: 'icon',
    label: 'Icon',
    apply: {
      mode: 'binary',
      preprocess: { autoThreshold: true, blur: 0 },
      trace: { simplify: 0.3, smoothing: 1, speckle: 16, strokeWidth: 0 },
    },
  },
  {
    id: 'manga',
    label: 'Manga',
    apply: {
      mode: 'binary',
      preprocess: { autoThreshold: false, threshold: 160, contrast: 30, blur: 0 },
      trace: { simplify: 0.6, smoothing: 0.4, speckle: 6, strokeWidth: 0 },
    },
  },
];

/** @param {{ modeGroup: HTMLElement, preprocessGroup: HTMLElement,
 *           traceGroup: HTMLElement, presetGroup: HTMLElement,
 *           paletteGroup: HTMLElement, paletteSection: HTMLElement }} opts */
export function initControls(opts) {
  renderModes(opts.modeGroup);
  renderFields(opts.preprocessGroup, 'preprocess', PREPROCESS_FIELDS);
  renderFields(opts.traceGroup, 'trace', TRACE_FIELDS);
  renderPresets(opts.presetGroup);

  store.subscribe(() => {
    refreshAll(opts);
    refreshPalette(opts);
  });
}

function refreshPalette({ paletteGroup, paletteSection }) {
  if (!paletteGroup || !paletteSection) return;
  const { palette, mode, paletteOverride } = store.state;
  if (!palette || !palette.length || mode !== 'color') {
    paletteSection.hidden = true;
    return;
  }
  paletteSection.hidden = false;
  paletteGroup.innerHTML = '';
  for (const orig of palette) {
    const current = paletteOverride?.[orig] ?? orig;
    const sw = document.createElement('label');
    sw.className = 'palette__swatch';
    sw.style.background = current;
    sw.title = `${orig}${orig !== current ? ' → ' + current : ''}（クリック: 色変更 / Shift+クリック: HEX コピー）`;

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = normalizeHex(current);
    picker.className = 'palette__picker';
    picker.addEventListener('input', () => {
      applyPaletteOverride(orig, picker.value);
    });
    picker.addEventListener('click', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        navigator.clipboard?.writeText(current).catch(() => {});
      }
    });

    if (orig !== current) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'palette__reset';
      reset.textContent = '×';
      reset.title = `元の色 (${orig}) に戻す`;
      reset.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        clearPaletteOverride(orig);
      });
      sw.appendChild(reset);
    }

    sw.appendChild(picker);
    paletteGroup.appendChild(sw);
  }
}

function applyPaletteOverride(orig, next) {
  const cur = store.state.paletteOverride ?? {};
  const map = { ...cur, [orig]: next };
  store.update({ paletteOverride: map });
  applyOverrideToSvg();
}

function clearPaletteOverride(orig) {
  const cur = { ...(store.state.paletteOverride ?? {}) };
  delete cur[orig];
  const next = Object.keys(cur).length ? cur : null;
  store.update({ paletteOverride: next });
  applyOverrideToSvg();
}

function applyOverrideToSvg() {
  const { svg, paletteOverride } = store.state;
  if (!svg) return;
  let out = svg;
  if (paletteOverride) {
    for (const [from, to] of Object.entries(paletteOverride)) {
      const re = new RegExp(`fill="${escapeRegex(from)}"`, 'gi');
      out = out.replace(re, `fill="${to}"`);
    }
  }
  if (out !== svg) {
    store.update({ svg: out });
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHex(hex) {
  if (typeof hex !== 'string') return '#000000';
  if (/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  if (/^#[0-9a-f]{3}$/i.test(hex)) {
    return '#' + hex.slice(1).split('').map((c) => c + c).join('');
  }
  return '#000000';
}

function renderModes(container) {
  container.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'chip-row';
  for (const mode of MODES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.dataset.mode = mode;
    chip.textContent = t(`mode.${mode}`);
    chip.setAttribute('data-i18n', `mode.${mode}`);
    chip.addEventListener('click', () => store.update({ mode }));
    row.appendChild(chip);
  }
  container.appendChild(row);
}

function renderFields(container, section, fields) {
  container.innerHTML = '';
  for (const f of fields) {
    if (f.kind === 'toggle') {
      container.appendChild(renderToggle(section, f));
    } else {
      container.appendChild(renderRange(section, f));
    }
  }
}

function renderRange(section, f) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field';
  wrapper.dataset.section = section;
  wrapper.dataset.key = f.key;
  if (f.disabledBy) wrapper.dataset.disabledBy = f.disabledBy;
  if (f.onlyForModes) wrapper.dataset.onlyForModes = f.onlyForModes.join(',');

  const labelEl = document.createElement('span');
  labelEl.className = 'field__label';
  labelEl.setAttribute('data-i18n', `field.${f.key}`);
  labelEl.textContent = t(`field.${f.key}`);

  const valueEl = document.createElement('span');
  valueEl.className = 'field__value';

  const inputEl = document.createElement('input');
  inputEl.type = 'range';
  inputEl.className = 'field__input';
  inputEl.min = String(f.min);
  inputEl.max = String(f.max);
  inputEl.step = String(f.step);
  inputEl.addEventListener('input', () => {
    const v = Number(inputEl.value);
    store.update({ [section]: { [f.key]: v } });
  });

  wrapper.appendChild(labelEl);
  wrapper.appendChild(valueEl);
  wrapper.appendChild(inputEl);
  return wrapper;
}

function renderToggle(section, f) {
  const wrapper = document.createElement('label');
  wrapper.className = 'field field--toggle';
  wrapper.dataset.section = section;
  wrapper.dataset.key = f.key;
  if (f.onlyForModes) wrapper.dataset.onlyForModes = f.onlyForModes.join(',');

  const inputEl = document.createElement('input');
  inputEl.type = 'checkbox';
  inputEl.className = 'field__check';
  inputEl.addEventListener('change', () => {
    store.update({ [section]: { [f.key]: inputEl.checked } });
  });

  const labelEl = document.createElement('span');
  labelEl.className = 'field__label';
  labelEl.setAttribute('data-i18n', `field.${f.key}`);
  labelEl.textContent = t(`field.${f.key}`);

  wrapper.appendChild(inputEl);
  wrapper.appendChild(labelEl);
  return wrapper;
}

function renderPresets(container) {
  container.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'chip-row';
  for (const p of PRESETS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = p.label;
    chip.addEventListener('click', () => store.update(p.apply));
    row.appendChild(chip);
  }
  container.appendChild(row);
}

function refreshAll({ modeGroup, preprocessGroup, traceGroup }) {
  const { mode, preprocess, trace } = store.state;
  modeGroup.querySelectorAll('.chip').forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.mode === mode));
  });
  syncFields(preprocessGroup, preprocess);
  syncFields(traceGroup, trace);
}

function syncFields(container, values) {
  const currentMode = store.state.mode;
  container.querySelectorAll('.field').forEach((field) => {
    const key = field.dataset.key;
    if (!key) return;

    // mode 制限のチェック
    const onlyForModes = field.dataset.onlyForModes;
    if (onlyForModes && !onlyForModes.split(',').includes(currentMode)) {
      field.hidden = true;
      return;
    }
    field.hidden = false;

    const v = values[key];
    const input = field.querySelector('input');
    const valueEl = field.querySelector('.field__value');
    if (input) {
      if (input.type === 'checkbox') input.checked = !!v;
      else if (v !== undefined) input.value = String(v);
    }
    if (valueEl && typeof v === 'number') valueEl.textContent = formatValue(v);

    const disabledByKey = field.dataset.disabledBy;
    if (disabledByKey) {
      const isDisabled = !!values[disabledByKey];
      field.classList.toggle('is-disabled', isDisabled);
      if (input) input.disabled = isDisabled;
    }
  });
}

function formatValue(v) {
  if (typeof v !== 'number') return String(v);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}
