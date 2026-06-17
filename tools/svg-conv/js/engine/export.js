/* engine/export.js — SVG を多様な拡張子へエクスポートする。
 *
 * SVG / SVGZ はテキストおよび圧縮済 Blob を返す。
 * PNG / JPEG / WebP は Image にロードして Canvas に描画したうえで toBlob で書き出す。
 * PDF は最小構成の PDF ドキュメントへ PNG として埋め込む。
 *
 * 全ての関数は { blob, filename, mime } を返すか、null（非対応）を返す。 */

import { toSvgz } from './optimizeSvg.js';

const FORMATS = {
  svg:  { mime: 'image/svg+xml', ext: 'svg' },
  svgz: { mime: 'image/svg+xml', ext: 'svgz' },
  png:  { mime: 'image/png',     ext: 'png'  },
  jpeg: { mime: 'image/jpeg',    ext: 'jpg'  },
  webp: { mime: 'image/webp',    ext: 'webp' },
  pdf:  { mime: 'application/pdf', ext: 'pdf' },
};

/** 出力サイズテンプレート — width/height (px), 'native' は元画像サイズに従う */
export const SIZE_TEMPLATES = {
  'native':            { width: null, height: null, label: '元サイズ' },
  'square-512':        { width: 512,  height: 512,  label: '正方 512' },
  'square-1024':       { width: 1024, height: 1024, label: '正方 1024' },
  'icon-128':          { width: 128,  height: 128,  label: 'アイコン 128' },
  'instagram-1080':    { width: 1080, height: 1080, label: 'Instagram 1:1' },
  'twitter-1500x500':  { width: 1500, height: 500,  label: 'X ヘッダ 3:1' },
  'youtube-1280x720':  { width: 1280, height: 720,  label: 'YouTube 16:9' },
  'a4':                { width: 595,  height: 842,  label: 'A4 縦' },
};

export function listSizeTemplates() {
  return Object.keys(SIZE_TEMPLATES);
}

export function listFormats() {
  return Object.keys(FORMATS);
}

export function formatLabel(fmt) {
  return ({
    svg: 'SVG',
    svgz: 'SVGZ',
    png: 'PNG',
    jpeg: 'JPEG',
    webp: 'WebP',
    pdf: 'PDF',
  })[fmt] ?? fmt.toUpperCase();
}

/** SVG 文字列とサイズから、指定フォーマットの Blob を生成する。
 *  rasterScale: ラスター系で 1.0=等倍。
 *  sizeTemplate: 'native' | 'square-512' 等。指定時は SVG の width/height/viewBox も書き換える。 */
export async function exportSvgAs(svgString, {
  format, width, height, baseName, rasterScale = 1, jpegQuality = 0.92, sizeTemplate = 'native',
}) {
  const fmt = FORMATS[format];
  if (!fmt) throw new Error(`unknown format: ${format}`);
  const filename = `${baseName || 'image'}.${fmt.ext}`;

  // テンプレートに合わせて出力サイズを決める
  const tpl = SIZE_TEMPLATES[sizeTemplate] ?? SIZE_TEMPLATES.native;
  const targetW = tpl.width ?? width;
  const targetH = tpl.height ?? height;

  // SVG はテンプレートサイズで width/height/viewBox を書き換える
  let svgOut = svgString;
  if (tpl.width && tpl.height) {
    svgOut = resizeSvg(svgString, targetW, targetH);
  }

  if (format === 'svg') {
    return { blob: new Blob([svgOut], { type: fmt.mime }), filename, mime: fmt.mime };
  }
  if (format === 'svgz') {
    const blob = await toSvgz(svgOut);
    if (!blob) return null;
    return { blob, filename, mime: fmt.mime };
  }

  // 以降はラスタライズが必要
  const sizedW = Math.max(1, Math.round(targetW * rasterScale));
  const sizedH = Math.max(1, Math.round(targetH * rasterScale));
  const pngBlob = await rasterizeSvg(svgOut, sizedW, sizedH, 'image/png', 1.0);
  if (!pngBlob) return null;

  if (format === 'png') return { blob: pngBlob, filename, mime: fmt.mime };
  if (format === 'jpeg' || format === 'webp') {
    const blob = await rasterizeSvg(svgOut, sizedW, sizedH, fmt.mime, jpegQuality);
    if (!blob) return null;
    return { blob, filename, mime: fmt.mime };
  }
  if (format === 'pdf') {
    const buf = await pngBlob.arrayBuffer();
    const blob = await buildPdfFromPng(new Uint8Array(buf), sizedW, sizedH);
    return { blob, filename, mime: fmt.mime };
  }
  return null;
}

/** SVG 文字列の width/height/viewBox を書き換えて新サイズで返す。
 *  オリジナルの viewBox を維持して比率は preserveAspectRatio="xMidYMid meet" で吸収。 */
function resizeSvg(svgString, w, h) {
  // 既存 width/height/viewBox を抽出
  const widthMatch = svgString.match(/<svg[^>]*\swidth="([^"]+)"/);
  const heightMatch = svgString.match(/<svg[^>]*\sheight="([^"]+)"/);
  const viewBoxMatch = svgString.match(/<svg[^>]*\sviewBox="([^"]+)"/);
  const ow = widthMatch ? parseFloat(widthMatch[1]) : null;
  const oh = heightMatch ? parseFloat(heightMatch[1]) : null;
  const vb = viewBoxMatch ? viewBoxMatch[1] : (ow && oh ? `0 0 ${ow} ${oh}` : `0 0 ${w} ${h}`);

  let out = svgString;
  // width
  if (widthMatch) out = out.replace(/(<svg[^>]*\swidth=")[^"]+(")/, `$1${w}$2`);
  else out = out.replace(/<svg/, `<svg width="${w}"`);
  // height
  if (heightMatch) out = out.replace(/(<svg[^>]*\sheight=")[^"]+(")/, `$1${h}$2`);
  else out = out.replace(/<svg/, `<svg height="${h}"`);
  // viewBox
  if (viewBoxMatch) out = out.replace(/(<svg[^>]*\sviewBox=")[^"]+(")/, `$1${vb}$2`);
  else out = out.replace(/<svg/, `<svg viewBox="${vb}"`);
  // preserveAspectRatio （未指定なら付与）
  if (!/<svg[^>]*\spreserveAspectRatio=/.test(out)) {
    out = out.replace(/<svg/, `<svg preserveAspectRatio="xMidYMid meet"`);
  }
  return out;
}

/** SVG 文字列を <img> 経由で OffscreenCanvas/Canvas に描画し、指定 MIME の Blob にする。 */
async function rasterizeSvg(svgString, w, h, mime, quality) {
  // viewBox を上書きせず、CanvasRenderingContext2D.drawImage の縮尺で対応する
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImage(url);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (mime === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    return await canvasToBlob(canvas, mime, quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function createCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      return new OffscreenCanvas(w, h);
    } catch {}
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasToBlob(canvas, mime, quality) {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mime, quality });
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));
}

/* -------- PDF (single page, embeds the rasterized image) -------- */
/* Minimal PDF 1.4 with a single Image XObject. PNG ではなく FlateDecode された
 * raw RGBA を埋め込む方が PDF 仕様としては素直なので、png blob を一度
 * canvas で展開して圧縮する。 */
async function buildPdfFromPng(_pngBytes, w, h) {
  // Canvas に再ロードして RGBA を取り出し、FlateDecode で埋める
  const blob = new Blob([_pngBytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  let rgba;
  try {
    const img = await loadImage(url);
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d unavailable');
    ctx.drawImage(img, 0, 0, w, h);
    if (canvas instanceof OffscreenCanvas) {
      rgba = ctx.getImageData(0, 0, w, h).data;
    } else {
      rgba = ctx.getImageData(0, 0, w, h).data;
    }
  } finally {
    URL.revokeObjectURL(url);
  }

  // RGBA → RGB
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }

  // CompressionStream で deflate
  const deflated = await deflate(rgb);

  // PDF オブジェクト構築
  const enc = new TextEncoder();
  const parts = []; // {bytes: Uint8Array}
  let offset = 0;
  const xref = [];

  const pushStr = (s) => {
    const u = enc.encode(s);
    parts.push(u);
    offset += u.length;
  };
  const pushBin = (u) => {
    parts.push(u);
    offset += u.length;
  };

  // Header
  pushStr('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n');

  // 1: catalog
  xref.push(offset);
  pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // 2: pages
  xref.push(offset);
  pushStr('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n');

  // 3: page
  xref.push(offset);
  pushStr(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] ` +
    `/Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  // 4: image XObject
  xref.push(offset);
  pushStr(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode ` +
    `/Length ${deflated.length} >>\nstream\n`,
  );
  pushBin(deflated);
  pushStr('\nendstream\nendobj\n');

  // 5: contents (draw image scaled to page)
  const contents = `q\n${w} 0 0 ${h} 0 0 cm\n/Im1 Do\nQ\n`;
  const contentsBytes = enc.encode(contents);
  xref.push(offset);
  pushStr(`5 0 obj\n<< /Length ${contentsBytes.length} >>\nstream\n`);
  pushBin(contentsBytes);
  pushStr('\nendstream\nendobj\n');

  // xref
  const xrefStart = offset;
  pushStr(`xref\n0 ${xref.length + 1}\n0000000000 65535 f \n`);
  for (const o of xref) pushStr(`${String(o).padStart(10, '0')} 00000 n \n`);

  // trailer
  pushStr(`trailer\n<< /Size ${xref.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(parts, { type: 'application/pdf' });
}

async function deflate(bytes) {
  if (typeof CompressionStream === 'undefined') {
    // 非対応環境: 無圧縮 deflate を構築するのは煩雑なのでフォールバックは諦める
    throw new Error('CompressionStream not supported (PDF export needs deflate)');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
