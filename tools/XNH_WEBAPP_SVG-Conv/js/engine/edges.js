/* engine/edges.js — Sobel フィルタによるエッジ検出。 */

/** RGBA imageData を入力として、エッジ強度マップ（Uint8Array, 0..255）を返す。 */
export function sobelMagnitude(imageData) {
  const { width: w, height: h, data } = imageData;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }

  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const tl = gray[i - w - 1], tc = gray[i - w], tr = gray[i - w + 1];
      const ml = gray[i - 1],            mr = gray[i + 1];
      const bl = gray[i + w - 1], bc = gray[i + w], br = gray[i + w + 1];
      const gx = -tl - 2 * ml - bl + tr + 2 * mr + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const mag = Math.sqrt(gx * gx + gy * gy);
      out[i] = mag > 255 ? 255 : mag | 0;
    }
  }
  return out;
}

/** エッジ強度マップを 2 値マスクに（threshold 以上なら 1）。 */
export function thresholdMag(mag, threshold) {
  const out = new Uint8Array(mag.length);
  for (let i = 0; i < mag.length; i++) out[i] = mag[i] >= threshold ? 1 : 0;
  return out;
}
