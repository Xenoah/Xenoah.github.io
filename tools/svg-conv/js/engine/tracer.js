/* engine/tracer.js — 自前のラスター→ベクター変換コア。
 *
 * 1. 2 値マスクから境界エッジ（ピクセル間の有向辺）をすべて抽出してチェーン化、
 *    閉路ポリゴンに分解する。CCW 方向に走るので、foreground は常に進行方向の右側になる。
 * 2. Douglas-Peucker で単純化。
 * 3. オプションで Catmull-Rom 風のベジェ平滑化。
 * 4. SVG path 文字列に変換。
 *
 * 外部依存なし。Worker からも UI からも呼べる純粋関数。 */

/** 2 値マスク（Uint8Array, 0 or 1）から閉路ポリゴンを抽出する。
 *  各ポリゴンは { points: [[x,y],...], hole: bool } 形式。 */
export function tracePolygonsFromMask(mask, w, h) {
  const stride = w + 1;
  const get = (x, y) => (x >= 0 && x < w && y >= 0 && y < h ? mask[y * w + x] : 0);

  // edges: corner -> queue of next corners (Int32 で k = y*(w+1)+x)
  const edges = new Map();
  const pushEdge = (sx, sy, ex, ey) => {
    const k = sy * stride + sx;
    const arr = edges.get(k);
    if (arr) arr.push(ex, ey);
    else edges.set(k, [ex, ey]);
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!get(x, y)) continue;
      // foreground を右手に、CW で囲むように辺を入れる（y 下向き座標系）
      if (!get(x, y - 1)) pushEdge(x, y, x + 1, y);          // top  → right
      if (!get(x + 1, y)) pushEdge(x + 1, y, x + 1, y + 1);  // right→ down
      if (!get(x, y + 1)) pushEdge(x + 1, y + 1, x, y + 1);  // bottom→ left
      if (!get(x - 1, y)) pushEdge(x, y + 1, x, y);          // left → up
    }
  }

  const paths = [];
  // 順序が安定するようキーをソートして処理
  const startKeys = [...edges.keys()].sort((a, b) => a - b);
  const startSet = new Set(startKeys);
  for (const startKey of startKeys) {
    if (!startSet.has(startKey)) continue;
    const arr = edges.get(startKey);
    if (!arr || arr.length === 0) continue;

    const sx = startKey % stride;
    const sy = (startKey - sx) / stride;
    const points = [[sx, sy]];
    let cx = sx;
    let cy = sy;
    let safety = w * h * 8;
    while (safety-- > 0) {
      const k = cy * stride + cx;
      const list = edges.get(k);
      if (!list || list.length === 0) break;
      const nx = list.shift();
      const ny = list.shift();
      if (list.length === 0) {
        edges.delete(k);
        startSet.delete(k);
      }
      if (nx === sx && ny === sy) {
        points.push([sx, sy]);
        break;
      }
      points.push([nx, ny]);
      cx = nx;
      cy = ny;
    }
    if (points.length >= 4) {
      const hole = isClockwise(points);
      paths.push({ points, hole });
    }
  }
  return paths;
}

function isClockwise(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    sum += (x2 - x1) * (y2 + y1);
  }
  return sum > 0;
}

/** Douglas-Peucker による多角形単純化。tolerance はピクセル単位。 */
export function simplifyPath(points, tolerance) {
  if (tolerance <= 0 || points.length < 3) return points;
  const closed =
    points.length > 2 &&
    points[0][0] === points[points.length - 1][0] &&
    points[0][1] === points[points.length - 1][1];
  const tol2 = tolerance * tolerance;

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    if (b - a < 2) continue;
    let maxD = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = sqDistToSegment(points[i], points[a], points[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol2 && idx !== -1) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }

  const out = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i]);
  if (closed && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) {
    out.push(out[0].slice());
  }
  return out;
}

function sqDistToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return ex * ex + ey * ey;
  }
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = a[0] + t * dx - p[0];
  const py = a[1] + t * dy - p[1];
  return px * px + py * py;
}

/** 多角形面積（絶対値）— speckle 除去判定用 */
export function polygonArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** ポリゴンを SVG path 文字列に変換（直線のみ）。 */
export function polygonToPath(pts, precision = 2) {
  if (!pts.length) return '';
  const r = (n) => Number(n.toFixed(precision));
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    d += `L${r(pts[i][0])} ${r(pts[i][1])}`;
  }
  d += 'Z';
  return d;
}

/** 連続 3 点の Catmull-Rom 風スプラインで Cubic Bezier に変換。 */
export function polygonToSmoothPath(pts, smoothing = 0.5, precision = 2) {
  if (smoothing <= 0 || pts.length < 5) return polygonToPath(pts, precision);
  const r = (n) => Number(n.toFixed(precision));
  // 末尾の重複点を取り除いて閉路として扱う
  const last = pts[pts.length - 1];
  const first = pts[0];
  const closed = last[0] === first[0] && last[1] === first[1];
  const ring = closed ? pts.slice(0, -1) : pts.slice();
  const n = ring.length;
  const t = smoothing / 3;
  let d = `M${r(ring[0][0])} ${r(ring[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = ring[(i - 1 + n) % n];
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    const p3 = ring[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += `C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`;
  }
  d += 'Z';
  return d;
}

/** 開いた折れ線（最初と最後の点が同じでない）を SVG path に変換。直線のみ。 */
export function polylineToPath(pts, precision = 2) {
  if (!pts.length) return '';
  const r = (n) => Number(n.toFixed(precision));
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) {
    d += `L${r(pts[i][0])} ${r(pts[i][1])}`;
  }
  return d;
}

/** 折れ線（開閉どちらも対応）を Catmull-Rom 風スプラインで Cubic Bezier に。 */
export function polylineToSmoothPath(pts, smoothing = 0.5, precision = 2) {
  if (smoothing <= 0 || pts.length < 3) return polylineToPath(pts, precision);
  const r = (n) => Number(n.toFixed(precision));
  const closed =
    pts.length > 2 &&
    pts[0][0] === pts[pts.length - 1][0] &&
    pts[0][1] === pts[pts.length - 1][1];
  if (closed) return polygonToSmoothPath(pts, smoothing, precision);

  const t = smoothing / 3;
  const n = pts.length;
  let d = `M${r(pts[0][0])} ${r(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) * t;
    const c1y = p1[1] + (p2[1] - p0[1]) * t;
    const c2x = p2[0] - (p3[0] - p1[0]) * t;
    const c2y = p2[1] - (p3[1] - p1[1]) * t;
    d += `C${r(c1x)} ${r(c1y)} ${r(c2x)} ${r(c2y)} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d;
}

/** マスクから一連のパスを生成し、SVG path string の配列を返す。 */
export function tracePolygons(
  mask,
  w,
  h,
  { simplify = 1.0, smoothing = 0, speckle = 0, precision = 2 } = {},
) {
  const polys = tracePolygonsFromMask(mask, w, h);
  const paths = [];
  for (const { points, hole } of polys) {
    const simp = simplifyPath(points, simplify);
    if (simp.length < 4) continue;
    const area = polygonArea(simp);
    if (area < speckle) continue;
    const d =
      smoothing > 0
        ? polygonToSmoothPath(simp, smoothing, precision)
        : polygonToPath(simp, precision);
    paths.push({ d, hole, area });
  }
  return paths;
}
