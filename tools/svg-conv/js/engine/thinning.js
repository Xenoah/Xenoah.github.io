/* engine/thinning.js — Zhang-Suen 細線化（skeletonize）と、
 * 1 ピクセル幅スケルトンを連続ストロークの折れ線に変換するトレーサ。
 *
 * 入力: 0/1 の Uint8Array マスク（前景=1）
 * 出力（thin）: 0/1 の Uint8Array、細線化後マスク
 * 出力（skeletonToPolylines）: [[x,y],...][] の折れ線配列。中心はピクセル整数座標。 */

/** Zhang-Suen Thinning。in-place せず新しい配列を返す。 */
export function zhangSuenThin(mask, w, h) {
  const out = new Uint8Array(mask);
  let changed = true;
  const buf = new Uint8Array(w * h);
  while (changed) {
    changed = false;
    // sub-iteration 1
    buf.set(out);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!buf[y * w + x]) continue;
        const N = neighbors(buf, w, x, y);
        // N = [P2,P3,P4,P5,P6,P7,P8,P9] (clockwise from north)
        const B = sum8(N);
        if (B < 2 || B > 6) continue;
        if (transitions(N) !== 1) continue;
        if (N[0] && N[2] && N[4]) continue; // P2*P4*P6
        if (N[2] && N[4] && N[6]) continue; // P4*P6*P8
        out[y * w + x] = 0;
        changed = true;
      }
    }
    // sub-iteration 2
    buf.set(out);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        if (!buf[y * w + x]) continue;
        const N = neighbors(buf, w, x, y);
        const B = sum8(N);
        if (B < 2 || B > 6) continue;
        if (transitions(N) !== 1) continue;
        if (N[0] && N[2] && N[6]) continue; // P2*P4*P8
        if (N[0] && N[4] && N[6]) continue; // P2*P6*P8
        out[y * w + x] = 0;
        changed = true;
      }
    }
  }
  return out;
}

function neighbors(m, w, x, y) {
  return [
    m[(y - 1) * w + x],     // P2 N
    m[(y - 1) * w + x + 1], // P3 NE
    m[y * w + x + 1],       // P4 E
    m[(y + 1) * w + x + 1], // P5 SE
    m[(y + 1) * w + x],     // P6 S
    m[(y + 1) * w + x - 1], // P7 SW
    m[y * w + x - 1],       // P8 W
    m[(y - 1) * w + x - 1], // P9 NW
  ];
}

function sum8(N) {
  let s = 0;
  for (let i = 0; i < 8; i++) s += N[i] ? 1 : 0;
  return s;
}

function transitions(N) {
  let c = 0;
  for (let i = 0; i < 8; i++) {
    const a = N[i] ? 1 : 0;
    const b = N[(i + 1) & 7] ? 1 : 0;
    if (a === 0 && b === 1) c++;
  }
  return c;
}

/** Skeleton マスク → 折れ線群に分解。
 *  分岐点で切り、行き止まり〜行き止まり（または分岐〜分岐）の連続線分を取り出す。 */
export function skeletonToPolylines(skel, w, h) {
  const visited = new Uint8Array(w * h);
  const lines = [];

  // 隣接 8 方向のオフセット（CCW 開始順）
  const D = [
    [1, 0], [1, 1], [0, 1], [-1, 1],
    [-1, 0], [-1, -1], [0, -1], [1, -1],
  ];

  function deg(x, y) {
    let n = 0;
    for (const [dx, dy] of D) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (skel[ny * w + nx]) n++;
    }
    return n;
  }

  function listNeighbors(x, y) {
    const arr = [];
    for (const [dx, dy] of D) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (skel[ny * w + nx]) arr.push([nx, ny]);
    }
    return arr;
  }

  function walkFrom(sx, sy) {
    // sx,sy が分岐点 or 終端 のとき、未訪問の各隣接を起点に伸ばす
    for (const [nx, ny] of listNeighbors(sx, sy)) {
      const k = ny * w + nx;
      if (visited[k]) continue;
      const line = [[sx, sy]];
      let cx = nx, cy = ny;
      let prevx = sx, prevy = sy;
      while (true) {
        const ck = cy * w + cx;
        line.push([cx, cy]);
        visited[ck] = 1;
        if (deg(cx, cy) === 1) break; // 行き止まり
        // 次のピクセル：未訪問でかつ「prev でない」隣接
        let nextx = -1, nexty = -1;
        // 分岐点ならここで終わり
        const ds = deg(cx, cy);
        if (ds > 2) break;
        for (const [dx, dy] of D) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          if (!skel[yy * w + xx]) continue;
          if (xx === prevx && yy === prevy) continue;
          if (visited[yy * w + xx]) continue;
          nextx = xx; nexty = yy;
          break;
        }
        if (nextx < 0) break;
        prevx = cx; prevy = cy;
        cx = nextx; cy = nexty;
      }
      if (line.length >= 2) lines.push(line);
    }
  }

  // 端点・分岐点から走査
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!skel[y * w + x]) continue;
      const d = deg(x, y);
      if (d === 1 || d >= 3) walkFrom(x, y);
    }
  }
  // 残った閉曲線（全ての点が degree=2）を回収
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!skel[k] || visited[k]) continue;
      const line = [[x, y]];
      visited[k] = 1;
      let cx = x, cy = y, prevx = -1, prevy = -1;
      while (true) {
        let nextx = -1, nexty = -1;
        for (const [dx, dy] of D) {
          const xx = cx + dx, yy = cy + dy;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          if (!skel[yy * w + xx]) continue;
          if (xx === prevx && yy === prevy) continue;
          if (visited[yy * w + xx]) continue;
          nextx = xx; nexty = yy;
          break;
        }
        if (nextx < 0) break;
        line.push([nextx, nexty]);
        visited[nexty * w + nextx] = 1;
        prevx = cx; prevy = cy;
        cx = nextx; cy = nexty;
      }
      if (line.length >= 3) {
        // 閉路として最後にスタート点を再追加
        line.push([x, y]);
        lines.push(line);
      }
    }
  }
  return lines;
}
