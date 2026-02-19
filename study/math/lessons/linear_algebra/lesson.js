import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Schema
const SCHEMA = {
    // Matrix Elements
    a: { label: 'a (i_x)', label_ja: 'a (i_x)', type: 'slider', min: -3, max: 3, step: 0.1, default: 1, folder: 'Matrix M = [[a, b], [c, d]]' },
    c: { label: 'c (i_y)', label_ja: 'c (i_y)', type: 'slider', min: -3, max: 3, step: 0.1, default: 0, folder: 'Matrix M = [[a, b], [c, d]]' },
    b: { label: 'b (j_x)', label_ja: 'b (j_x)', type: 'slider', min: -3, max: 3, step: 0.1, default: 0, folder: 'Matrix M = [[a, b], [c, d]]' },
    d: { label: 'd (j_y)', label_ja: 'd (j_y)', type: 'slider', min: -3, max: 3, step: 0.1, default: 1, folder: 'Matrix M = [[a, b], [c, d]]' },

    showGrid: { label: 'Show Transformed Grid', label_ja: '変換後のグリッド', type: 'toggle', default: true, folder: 'View' },
    showEigen: { label: 'Show Eigenvectors', label_ja: '固有ベクトル', type: 'toggle', default: true, folder: 'View' },
    anim: { label: 'Animate Transformation', label_ja: '変換アニメーション', type: 'slider', min: 0, max: 1, step: 0.01, default: 1, folder: 'View' }
};

// 2. Setup
const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');
const runtime = new LessonRuntime(update); // Loop needed for smooth transition if we implement animation

// No play/pause needed really, but we can animate the interpolation
// Let's bind share at least
document.getElementById('btn-share').addEventListener('click', () => {
    const url = paramsManager.serializeToUrl();
    navigator.clipboard.writeText(url).then(() => alert(Globals.getText('Link copied!', 'Link copied!', 'リンクをコピーしました！')));
});
window.addEventListener('resize', () => Render.setupCanvas(canvas));

// Preset Helper
window.setMatrix = (a, b, c, d) => {
    paramsManager.updateParam('a', a, true);
    paramsManager.updateParam('b', b, true);
    paramsManager.updateParam('c', c, true);
    paramsManager.updateParam('d', d, true);
    paramsManager.updateParam('anim', 0, true); // Reset anim

    // Simple tween simulation for fun? 
    // Usually param update is instant. 
    // We can just let user slide 'Animation' slider or we can implement a logic to auto-slide it.
    // Let's just set it to 1 (Done)
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

// 3. Logic
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

    // Themes
    const colGrid = Render.getThemeColor('--grid-line');
    const colAxis = Render.getThemeColor('--text-muted');
    const colI = Render.getThemeColor('--accent-primary'); // i-hat
    const colJ = Render.getThemeColor('--accent-tertiary'); // j-hat
    const colGridTrans = 'rgba(100, 200, 255, 0.3)';

    // Draw Base Grid (Background)
    Render.drawGrid(ctx, xRange, yRange, 1);

    // Interpolation for animation
    // M = I + t * (M_target - I)
    const t = p.anim;
    const a = 1 + t * (p.a - 1);
    const b = 0 + t * (p.b - 0);
    const c = 0 + t * (p.c - 0);
    const d = 1 + t * (p.d - 1);

    // Draw Transformed Grid
    if (p.showGrid) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = colGridTrans;

        const range = 20; // How many lines to draw

        // Vertical lines
        for (let ix = -range; ix <= range; ix++) {
            ctx.beginPath();
            // Line from (ix, -range) to (ix, range)
            const p1 = transform(ix, -range, a, b, c, d);
            const p2 = transform(ix, range, a, b, c, d);
            const s1 = Render.toScreen(p1.x, p1.y, ctx, xRange, yRange);
            const s2 = Render.toScreen(p2.x, p2.y, ctx, xRange, yRange);
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
        }

        // Horizontal lines
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

    // Draw Basis Vectors
    const origin = Render.toScreen(0, 0, ctx, xRange, yRange);

    // i-hat (1, 0)
    const iTrans = transform(1, 0, a, b, c, d);
    const iScreen = Render.toScreen(iTrans.x, iTrans.y, ctx, xRange, yRange);
    Render.drawLine(ctx, origin.x, origin.y, iScreen.x, iScreen.y, colI, 3);
    Render.drawText(ctx, 'i', iScreen.x + 10, iScreen.y, colI, 'bold 16px sans-serif');

    // j-hat (0, 1)
    const jTrans = transform(0, 1, a, b, c, d);
    const jScreen = Render.toScreen(jTrans.x, jTrans.y, ctx, xRange, yRange);
    Render.drawLine(ctx, origin.x, origin.y, jScreen.x, jScreen.y, colJ, 3);
    Render.drawText(ctx, 'j', jScreen.x + 10, jScreen.y, colJ, 'bold 16px sans-serif');

    // Determinant
    const det = a * d - b * c;
    const detText = `det(M) = ${det.toFixed(2)}`;
    Render.drawText(ctx, detText, 20, 30, Render.getThemeColor('--text-color'));

    // Visualizing Area: Unit Square
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

    // Eigenvectors
    // lambda^2 - tr(M)lambda + det(M) = 0
    // tr = a + d
    if (p.showEigen) {
        // Only valid for final state to avoid confusion during anim? 
        // Or always calculate for current a,b,c,d

        const tr = a + d;
        const disc = tr * tr - 4 * det;

        if (disc >= 0) {
            const l1 = (tr + Math.sqrt(disc)) / 2;
            const l2 = (tr - Math.sqrt(disc)) / 2;

            // For each lambda, solve (M - lI)v = 0
            // (a-l)x + by = 0 => y = -(a-l)/b * x  OR  x = -b/(a-l) * y
            // If b=0, then (a-l)x=0 => if a!=l x=0, y=1 (j-hat is eigen)

            drawEigen(ctx, a, b, c, d, l1, xRange, yRange, 'yellow');
            if (Math.abs(l1 - l2) > 0.001) {
                drawEigen(ctx, a, b, c, d, l2, xRange, yRange, 'orange');
            }
        }
    }
}

function drawEigen(ctx, a, b, c, d, lambda, xRange, yRange, color) {
    // Find vector v
    let vx, vy;

    if (Math.abs(b) > 0.001) {
        vx = 1;
        vy = -(a - lambda) / b;
    } else if (Math.abs(c) > 0.001) {
        vy = 1;
        vx = -(d - lambda) / c;
    } else {
        // Diagonal matrix
        // if a == lambda, v=[1,0], if d == lambda, v=[0,1]
        // logic simplifies
        vx = (Math.abs(a - lambda) < 0.001) ? 1 : 0;
        vy = (Math.abs(d - lambda) < 0.001) ? 1 : 0;
    }

    // Normalize logic for visuals? Just draw a line across screen
    // y = (vy/vx) * x
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
        // Vertical line
        const x = 0; // Passes through origin
        const p1 = Render.toScreen(0, yRange[0], ctx, xRange, yRange);
        const p2 = Render.toScreen(0, yRange[1], ctx, xRange, yRange);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }

    ctx.stroke();
    ctx.setLineDash([]);

    // Label
    Render.drawText(ctx, `λ=${lambda.toFixed(2)}`, 20, color === 'yellow' ? 50 : 70, color);
}
