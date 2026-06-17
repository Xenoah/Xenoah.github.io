/* engine/optimizeSvg.js — 自前のミニマル SVG 最適化。
 * 浮動小数点丸め、空白圧縮、冗長な閉じタグ整理を行う。 */

/** Count element nodes inside a serialized SVG string. */
export function countNodes(svgString) {
  if (!svgString) return 0;
  const matches = svgString.match(/<[a-zA-Z][^!>]*?>/g);
  return matches ? matches.length : 0;
}

/** Round numeric values in path/attribute strings, compress whitespace. */
export function optimize(svgString, { precision = 2 } = {}) {
  if (!svgString) return svgString;
  let out = svgString;
  out = out.replace(/-?\d+\.\d+(?:[eE][+-]?\d+)?/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    const factor = 10 ** precision;
    const rounded = Math.round(n * factor) / factor;
    let s = String(rounded);
    // 0.5 → .5, -0.5 → -.5 で短く
    s = s.replace(/^0\./, '.').replace(/^-0\./, '-.');
    return s;
  });
  // 連続空白の圧縮
  out = out.replace(/[\t\n\r ]+/g, ' ');
  // 属性区切り直前の空白
  out = out.replace(/ ([>/])/g, '$1');
  // 数値間の前置 0 のスペース除去（"L 5 6" → "L5 6"）
  out = out.replace(/([MLCQTAZmlcqtaz]) /g, '$1');
  return out.trim();
}

/** Compute a small metadata object for the result preview. */
export function describe(svgString) {
  return {
    bytes: new Blob([svgString]).size,
    nodes: countNodes(svgString),
  };
}

/** SVG をクリップボードへコピー。失敗したら false。 */
export async function copyToClipboard(svgString) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(svgString);
      return true;
    }
  } catch (err) {
    console.warn('[optimizeSvg] clipboard write failed', err);
  }
  return false;
}

/** SVG → SVGZ (gzip) を CompressionStream で生成。返値は Blob。
 *  CompressionStream 非対応環境では null を返す。 */
export async function toSvgz(svgString) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([svgString], { type: 'image/svg+xml' })
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const compressed = await new Response(stream).blob();
  return new Blob([await compressed.arrayBuffer()], { type: 'image/svg+xml' });
}
