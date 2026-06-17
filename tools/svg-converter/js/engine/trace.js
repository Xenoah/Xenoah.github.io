/* engine/trace.js — モード別にトレースを実行し、SVG 文字列を生成する。
 *
 * 入力 imageData は preview 側で前処理済み（ToneCurve / Blur / Binarize / Grayscale）。
 * モードごとに必要な追加処理を行ってから tracer 系へ渡す。 */

import {
  tracePolygons,
  simplifyPath,
  polylineToPath,
  polylineToSmoothPath,
} from './tracer.js';
import { medianCutQuantize, rgbToHex } from './quantize.js';
import { sobelMagnitude, thresholdMag } from './edges.js';
import { zhangSuenThin, skeletonToPolylines } from './thinning.js';

/** @param {ImageData} imageData
 *  @param {{ mode: string, params: { preprocess: any, trace: any },
 *           onProgress?: (v:number)=>void, isCancelled?: ()=>boolean }} ctx */
export function traceImageData(imageData, ctx) {
  const { mode, params, onProgress = () => {}, isCancelled = () => false } = ctx;
  const w = imageData.width;
  const h = imageData.height;

  switch (mode) {
    case 'binary':
    case 'silhouette':
    case 'outline': {
      onProgress(0.1);
      const mask = imageDataToBinaryMask(imageData);
      if (isCancelled()) return cancelled();
      onProgress(0.4);
      const paths = tracePolygons(mask, w, h, {
        simplify: params.trace.simplify,
        smoothing: params.trace.smoothing,
        speckle: params.trace.speckle,
        precision: 2,
      });
      if (isCancelled()) return cancelled();
      onProgress(0.9);
      return wrapSvg(w, h, renderMonoPaths(paths, mode, params.trace));
    }

    case 'centerline': {
      onProgress(0.1);
      let mask = imageDataToBinaryMask(imageData);
      if (params.trace.thinning !== false) {
        if (isCancelled()) return cancelled();
        onProgress(0.3);
        mask = zhangSuenThin(mask, w, h);
      }
      if (isCancelled()) return cancelled();
      onProgress(0.55);
      const polylines = skeletonToPolylines(mask, w, h);
      if (isCancelled()) return cancelled();
      onProgress(0.85);
      return wrapSvg(w, h, renderStrokes(polylines, params.trace));
    }

    case 'edges': {
      onProgress(0.1);
      const mag = sobelMagnitude(imageData);
      if (isCancelled()) return cancelled();
      onProgress(0.3);
      const t = Math.max(8, params.preprocess.threshold);
      let mask = thresholdMag(mag, t);
      if (params.trace.thinning !== false) {
        onProgress(0.5);
        mask = zhangSuenThin(mask, w, h);
      }
      onProgress(0.7);
      const polylines = skeletonToPolylines(mask, w, h);
      if (isCancelled()) return cancelled();
      onProgress(0.9);
      return wrapSvg(w, h, renderStrokes(polylines, params.trace));
    }

    case 'color': {
      onProgress(0.05);
      const colors = Math.max(2, Math.min(32, Math.round(params.trace.colors || 8)));
      const { indices, palette } = medianCutQuantize(imageData, colors);
      if (isCancelled()) return cancelled();
      onProgress(0.3);

      const groups = [];
      const stepBase = 0.3;
      const stepRange = 0.6;
      for (let ci = 0; ci < palette.length; ci++) {
        if (isCancelled()) return cancelled();
        const mask = new Uint8Array(w * h);
        for (let p = 0; p < indices.length; p++) mask[p] = indices[p] === ci ? 1 : 0;
        const paths = tracePolygons(mask, w, h, {
          simplify: params.trace.simplify,
          smoothing: params.trace.smoothing,
          speckle: params.trace.speckle,
          precision: 2,
        });
        if (paths.length) {
          const dAttr = paths.map((p) => p.d).join(' ');
          const fill = rgbToHex(palette[ci]);
          groups.push(`<path d="${dAttr}" fill="${fill}" fill-rule="evenodd"/>`);
        }
        onProgress(stepBase + (stepRange * (ci + 1)) / palette.length);
      }
      onProgress(0.95);
      return wrapSvg(w, h, groups.join(''));
    }

    default:
      return wrapSvg(w, h, '<text x="50%" y="50%" text-anchor="middle">unsupported mode</text>');
  }
}

function imageDataToBinaryMask(imageData) {
  // preview 側で binarize 済み（白=255, 黒=0）。「黒」を前景=1 とする。
  const data = imageData.data;
  const mask = new Uint8Array(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    mask[p] = data[i] < 128 ? 1 : 0;
  }
  return mask;
}

function renderMonoPaths(paths, mode, traceParams) {
  if (!paths.length) return '';
  const dAttr = paths.map((p) => p.d).join(' ');
  const stroke =
    traceParams.strokeWidth > 0
      ? ` stroke="#000" stroke-width="${traceParams.strokeWidth}"`
      : '';
  if (mode === 'silhouette' || mode === 'outline' || mode === 'binary') {
    return `<path d="${dAttr}" fill="#000" fill-rule="evenodd"${stroke}/>`;
  }
  const sw = traceParams.strokeWidth || 1;
  return `<path d="${dAttr}" fill="none" stroke="#000" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

function renderStrokes(polylines, traceParams) {
  if (!polylines.length) return '';
  const tol = Math.max(0, traceParams.simplify ?? 0);
  const smoothing = Math.max(0, Math.min(1, traceParams.smoothing ?? 0));
  const minLen = Math.max(0, traceParams.speckle ?? 0);
  const sw = traceParams.strokeWidth > 0 ? traceParams.strokeWidth : 1;

  const segments = [];
  for (const poly of polylines) {
    if (poly.length < 2) continue;
    const length = polylineLength(poly);
    if (length < minLen) continue;
    const reduced = tol > 0 ? simplifyPath(poly, tol) : poly;
    if (reduced.length < 2) continue;
    const d =
      smoothing > 0
        ? polylineToSmoothPath(reduced, smoothing, 2)
        : polylineToPath(reduced, 2);
    segments.push(d);
  }
  if (!segments.length) return '';
  return `<path d="${segments.join(' ')}" fill="none" stroke="#000" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`;
}

function polylineLength(pts) {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    s += Math.hypot(dx, dy);
  }
  return s;
}

function wrapSvg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${body}</svg>`;
}

function cancelled() {
  return null;
}
