/* engine/quantize.js — Median Cut によるカラー量子化。
 * RGBA ImageData → 各ピクセルにパレット index を割り当てた Uint8Array と、パレット配列を返す。 */

/** @param {ImageData} imageData
 *  @param {number} colorCount 2..256
 *  @returns {{ indices: Uint8Array, palette: number[][] }}  palette は [r,g,b][] */
export function medianCutQuantize(imageData, colorCount) {
  const data = imageData.data;
  const len = data.length / 4;
  const pixels = new Array(len);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    pixels[p] = [data[i], data[i + 1], data[i + 2]];
  }

  const buckets = [pixels];
  while (buckets.length < colorCount) {
    let target = -1;
    let maxRange = -1;
    let axis = 0;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      const r = ranges(buckets[i]);
      const m = Math.max(r[0], r[1], r[2]);
      if (m > maxRange) {
        maxRange = m;
        target = i;
        axis = r.indexOf(m);
      }
    }
    if (target === -1) break;
    const bucket = buckets[target];
    bucket.sort((a, b) => a[axis] - b[axis]);
    const mid = bucket.length >> 1;
    buckets.splice(target, 1, bucket.slice(0, mid), bucket.slice(mid));
  }

  const palette = buckets.map(averageColor);
  const indices = new Uint8Array(len);
  for (let p = 0; p < len; p++) {
    const r = data[p * 4];
    const g = data[p * 4 + 1];
    const b = data[p * 4 + 2];
    indices[p] = nearestPaletteIndex(palette, r, g, b);
  }
  return { indices, palette };
}

function ranges(bucket) {
  let rmin = 255, rmax = 0, gmin = 255, gmax = 0, bmin = 255, bmax = 0;
  for (const [r, g, b] of bucket) {
    if (r < rmin) rmin = r;
    if (r > rmax) rmax = r;
    if (g < gmin) gmin = g;
    if (g > gmax) gmax = g;
    if (b < bmin) bmin = b;
    if (b > bmax) bmax = b;
  }
  return [rmax - rmin, gmax - gmin, bmax - bmin];
}

function averageColor(bucket) {
  if (!bucket.length) return [0, 0, 0];
  let r = 0, g = 0, b = 0;
  for (const px of bucket) {
    r += px[0];
    g += px[1];
    b += px[2];
  }
  return [
    Math.round(r / bucket.length),
    Math.round(g / bucket.length),
    Math.round(b / bucket.length),
  ];
}

function nearestPaletteIndex(palette, r, g, b) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const dr = r - palette[i][0];
    const dg = g - palette[i][1];
    const db = b - palette[i][2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
