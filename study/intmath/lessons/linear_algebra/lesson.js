/* 2×2行列の線形変換を、格子・基底・面積・固有方向として可視化する。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// SCHEMAの列ベクトル(a,c)、(b,d)を行列Mの2本の基底像として扱う。
const SCHEMA = {
    a: { label: 'a (i_x)', label_ja: 'a (i_x)', type: 'slider', min: -3, max: 3, step: 0.1, default: 1, folder: 'Matrix M = [[a, b], [c, d]]' },
    c: { label: 'c (i_y)', label_ja: 'c (i_y)', type: 'slider', min: -3, max: 3, step: 0.1, default: 0, folder: 'Matrix M = [[a, b], [c, d]]' },
    b: { label: 'b (j_x)', label_ja: 'b (j_x)', type: 'slider', min: -3, max: 3, step: 0.1, default: 0, folder: 'Matrix M = [[a, b], [c, d]]' },
    d: { label: 'd (j_y)', label_ja: 'd (j_y)', type: 'slider', min: -3, max: 3, step: 0.1, default: 1, folder: 'Matrix M = [[a, b], [c, d]]' },

    showGrid: { label: 'Show Transformed Grid', label_ja: '変換後のグリッド', type: 'toggle', default: true, folder: 'View' },
    showEigen: { label: 'Show Eigenvectors', label_ja: '固有ベクトル', type: 'toggle', default: true, folder: 'View' },
    anim: { label: 'Animate Transformation', label_ja: '変換アニメーション', type: 'slider', min: 0, max: 1, step: 0.01, default: 1, folder: 'View' }
};

const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');
const runtime = new LessonRuntime(update);

// 行列の状態はURLへ保存し、同じ変換を共有リンクから再現できる。
document.getElementById('btn-share').addEventListener('click', () => {
    const url = paramsManager.serializeToUrl();
    navigator.clipboard.writeText(url).then(() => alert(Globals.getText('Link copied!', 'Link copied!', 'リンクをコピーしました！')));
});
window.addEventListener('resize', () => Render.setupCanvas(canvas));

// プリセット更新もParameterManager経由に統一し、表示値と内部値を同期する。
window.setMatrix = (a, b, c, d) => {
    paramsManager.updateParam('a', a, true);
    paramsManager.updateParam('b', b, true);
    paramsManager.updateParam('c', c, true);
    paramsManager.updateParam('d', d, true);
    paramsManager.updateParam('anim', 0, true);
    paramsManager.updateParam('anim', 1, true);
};

Globals.subscribe(state => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Linear Algebra', ja: '線形代数' },
            'desc': { en: 'Visualizing matrix transformations', ja: '行列による線形変換の可視化' },
            'presets': { en: 'Presets', ja: 'プリセット' },
            'p_ident': { en: 'Identity', ja: '単位行列' },
            'p_scale': { en: 'Scale 2x', ja: '2倍拡大' },
            'p_rot90': { en: 'Rot 90°', ja: '90度回転' },
            'p_shear': { en: 'Shear X', ja: 'せん断 (X)' },
            'share': { en: 'Share', ja: '共有' }
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });
    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');
});

function transform(x, y, a, b, c, d) {
    return {
        x: a * x + b * y,
        y: c * x + d * y
    };
}

function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 50;

    const xRange = [-cx / scale, cx / scale];
    const yRange = [-cy / scale, cy / scale];

    // CanvasはCSSを継承しないため、テーマ色を描画ごとに取得する。
    const colGrid = Render.getThemeColor('--grid-line');
    const colAxis = Render.getThemeColor('--text-muted');
    const colI = Render.getThemeColor('--accent-primary');
    const colJ = Render.getThemeColor('--accent-tertiary');
    const colGridTrans = 'rgba(100, 200, 255, 0.3)';

    // 変換前の格子を基準として先に描く。
    Render.drawGrid(ctx, xRange, yRange, 1);

    // 単位行列Iから目標行列Mまでを I + t(M-I) で線形補間する。
    const t = p.anim;
    const a = 1 + t * (p.a - 1);
    const b = 0 + t * (p.b - 0);
    const c = 0 + t * (p.c - 0);
    const d = 1 + t * (p.d - 1);

    // 補間中の行列で格子線の両端を変換する。
    if (p.showGrid) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = colGridTrans;

        const range = 20;

        // 元空間の縦線群を変換する。
        for (let ix = -range; ix <= range; ix++) {
            ctx.beginPath();
            const p1 = transform(ix, -range, a, b, c, d);
            const p2 = transform(ix, range, a, b, c, d);
            const s1 = Render.toScreen(p1.x, p1.y, ctx, xRange, yRange);
            const s2 = Render.toScreen(p2.x, p2.y, ctx, xRange, yRange);
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
        }

        // 元空間の横線群を変換する。
        for (let iy = -range; iy <= range; iy++) {
            ctx.beginPath();
            const p1 = transform(-range, iy, a, b, c, d);
            const p2 = transform(range, iy, a, b, c, d);
            const s1 = Render.toScreen(p1.x, p1.y, ctx, xRange, yRange);
            const s2 = Render.toScreen(p2.x, p2.y, ctx, xRange, yRange);
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
        }
    }

    // 変換後の標準基底i、jを別色で描く。
    const origin = Render.toScreen(0, 0, ctx, xRange, yRange);

    const iTrans = transform(1, 0, a, b, c, d);
    const iScreen = Render.toScreen(iTrans.x, iTrans.y, ctx, xRange, yRange);
    Render.drawLine(ctx, origin.x, origin.y, iScreen.x, iScreen.y, colI, 3);
    Render.drawText(ctx, 'i', iScreen.x + 10, iScreen.y, colI, 'bold 16px sans-serif');

    const jTrans = transform(0, 1, a, b, c, d);
    const jScreen = Render.toScreen(jTrans.x, jTrans.y, ctx, xRange, yRange);
    Render.drawLine(ctx, origin.x, origin.y, jScreen.x, jScreen.y, colJ, 3);
    Render.drawText(ctx, 'j', jScreen.x + 10, jScreen.y, colJ, 'bold 16px sans-serif');

    // 行列式は単位正方形の符号付き面積倍率として表示する。
    const det = a * d - b * c;
    const detText = `det(M) = ${det.toFixed(2)}`;
    Render.drawText(ctx, detText, 20, 30, Render.getThemeColor('--text-color'));

    // 変換後の単位正方形を塗り、面積変化を視覚化する。
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    const p0 = Render.toScreen(0, 0, ctx, xRange, yRange);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(iScreen.x, iScreen.y);
    const pComb = transform(1, 1, a, b, c, d);
    const sComb = Render.toScreen(pComb.x, pComb.y, ctx, xRange, yRange);
    ctx.lineTo(sComb.x, sComb.y);
    ctx.lineTo(jScreen.x, jScreen.y);
    ctx.closePath();
    ctx.fill();

    // 特性方程式 λ²-tr(M)λ+det(M)=0 に実数解がある場合だけ固有方向を描く。
    if (p.showEigen) {
        const tr = a + d;
        const disc = tr * tr - 4 * det;

        if (disc >= 0) {
            const l1 = (tr + Math.sqrt(disc)) / 2;
            const l2 = (tr - Math.sqrt(disc)) / 2;

            // 各固有値について(M-λI)v=0を満たす代表ベクトルを求める。

            drawEigen(ctx, a, b, c, d, l1, xRange, yRange, 'yellow');
            if (Math.abs(l1 - l2) > 0.001) {
                drawEigen(ctx, a, b, c, d, l2, xRange, yRange, 'orange');
            }
        }
    }
}

function drawEigen(ctx, a, b, c, d, lambda, xRange, yRange, color) {
    // 数値的に安定な成分を選んで固有ベクトルを構成する。
    let vx, vy;

    if (Math.abs(b) > 0.001) {
        vx = 1;
        vy = -(a - lambda) / b;
    } else if (Math.abs(c) > 0.001) {
        vy = 1;
        vx = -(d - lambda) / c;
    } else {
        // 対角行列では対応する座標軸を固有方向として選ぶ。
        vx = (Math.abs(a - lambda) < 0.001) ? 1 : 0;
        vy = (Math.abs(d - lambda) < 0.001) ? 1 : 0;
    }

    // 固有ベクトル自体の長さではなく方向を示すため、画面全体を横切る直線として描く。
    const slope = (Math.abs(vx) > 0.001) ? vy / vx : null;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.setLineDash([5, 5]); // Dashed because it's a line span

    if (slope !== null) {
        const xMin = xRange[0];
        const yMin = slope * xMin;
        const xMax = xRange[1];
        const yMax = slope * xMax;

        const p1 = Render.toScreen(xMin, yMin, ctx, xRange, yRange);
        const p2 = Render.toScreen(xMax, yMax, ctx, xRange, yRange);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    } else {
        // x成分がほぼ0の場合は垂直線として描く。
        const x = 0; // Passes through origin
        const p1 = Render.toScreen(0, yRange[0], ctx, xRange, yRange);
        const p2 = Render.toScreen(0, yRange[1], ctx, xRange, yRange);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }

    ctx.stroke();
    ctx.setLineDash([]);

    // 固有値ラベルを方向線の近くへ表示する。
    Render.drawText(ctx, `λ=${lambda.toFixed(2)}`, 20, color === 'yellow' ? 50 : 70, color);
}
