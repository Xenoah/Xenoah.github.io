/* ui/dropZone.js — D&D / クリック / クリップボード貼付で画像を取り込む。 */

import { store } from '../store.js';

const ACCEPT_TYPES = /^image\/(png|jpe?g|webp|bmp|gif|avif|x-png)$/i;

/** @param {{ dropzoneEl: HTMLElement, fileInputEl: HTMLInputElement }} opts */
export function initDropZone({ dropzoneEl, fileInputEl }) {
  const onDragEnter = (e) => {
    e.preventDefault();
    dropzoneEl.classList.add('is-active');
  };
  const onDragLeave = (e) => {
    if (e.target === dropzoneEl) dropzoneEl.classList.remove('is-active');
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e) => {
    e.preventDefault();
    dropzoneEl.classList.remove('is-active');
    const file = pickFirstImage(e.dataTransfer?.files);
    if (file) loadFile(file);
  };

  dropzoneEl.addEventListener('dragenter', onDragEnter);
  dropzoneEl.addEventListener('dragleave', onDragLeave);
  dropzoneEl.addEventListener('dragover', onDragOver);
  dropzoneEl.addEventListener('drop', onDrop);

  dropzoneEl.addEventListener('click', () => fileInputEl.click());
  dropzoneEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInputEl.click();
    }
  });

  fileInputEl.addEventListener('change', () => {
    const file = pickFirstImage(fileInputEl.files);
    if (file) loadFile(file);
    fileInputEl.value = '';
  });

  // クリップボード貼付（ページ全体で受け付ける）
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          loadFile(file);
          e.preventDefault();
          return;
        }
      }
    }
  });
}

function pickFirstImage(fileList) {
  if (!fileList) return null;
  for (const f of fileList) {
    if (ACCEPT_TYPES.test(f.type) || f.type.startsWith('image/')) return f;
  }
  return null;
}

async function loadFile(file) {
  store.update({ ui: { busy: true, statusKey: 'status.loading' } });
  try {
    const bitmap = await createImageBitmap(file);
    store.update({
      source: {
        name: file.name || 'pasted-image',
        type: file.type || 'image/png',
        width: bitmap.width,
        height: bitmap.height,
        imageBitmap: bitmap,
      },
      ui: { busy: false, statusKey: 'status.idle' },
    });
  } catch (err) {
    console.error('[dropZone] load failed', err);
    store.update({ ui: { busy: false, statusKey: 'status.error' } });
  }
}

export { loadFile };
