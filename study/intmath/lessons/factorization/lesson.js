/* 因数分解の式と幾何的な面積表現を同じパラメーターから描画する。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Schema
const SCHEMA = {
    a: { label: 'a (curvature)', label_ja: 'a (曲率)', type: 'slider', min: -5, max: 5, step: 0.1, default: 1, folder: 'Coefficients' },
    b: { label: 'b (slope)', label_ja: 'b (傾き)', type: 'slider', min: -10, max: 10, step: 0.1, default: 0, folder: 'Coefficients' },
    c: { label: 'c (offset)', label_ja: 'c (切片)', type: 'slider', min: -10, max: 10, step: 0.1, default: -2, folder: 'Coefficients' },
    zoom: { label: 'Zoom', label_ja: 'ズーム', type: 'slider', min: 10, max: 100, step: 1, default: 40, folder: 'View' },
    showComplex: { label: 'Show Complex Plane', label_ja: '複素平面を表示', type: 'toggle', default: false, folder: 'View' }
};

// 2. Setup
const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');
const runtime = new LessonRuntime(update);

// Bind Controls
runtime.bindControls('btn-play', 'btn-reset');
document.getElementById('btn-share').addEventListener('click', () => {
    const url = paramsManager.serializeToUrl();
    navigator.clipboard.writeText(url).then(() => alert(Globals.getText('Link copied!', 'Link copied!', 'リンクをコピーしました！')));
});
window.addEventListener('resize', () => Render.setupCanvas(canvas));

Globals.subscribe(state => {
    // Update presets text? We'll rely on HTML data-i18n for those static buttons
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Factorization', ja: '因数分解' },
            'desc': { en: 'Visualizing quadratic equations', ja: '二次方程式の可視化' },
            'presets': { en: 'Presets', ja: 'プリセット' },
            'p_roots1': { en: 'Roots ±1', ja: '解 ±1' },
            'p_double': { en: 'Double Root', ja: '重解' },
            'p_complex': { en: 'Complex', ja: '複素数解' },
            'playback': { en: 'Playback', ja: '再生操作' },
            'share': { en: 'Share', ja: '共有' }
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });

    // Update play button
    const playBtn = document.getElementById('btn-play');
    if (playBtn) playBtn.textContent = runtime.isRunning ?
        Globals.getText('Pause', 'Pause', '一時停止') :
        Globals.getText('Play', 'Play', '再生');
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) resetBtn.textContent = Globals.getText('Reset', 'Reset', 'リセット');
    const shareBtn = document.getElementById('btn-share');
    if (shareBtn) shareBtn.textContent = Globals.getText('Share', 'Share', '共有');
});

// Global Helper for buttons
window.setPreset = (a, b, c) => {
    paramsManager.updateParam('a', a, true);
    paramsManager.updateParam('b', b, true);
    paramsManager.updateParam('c', c, true);
};

// 3. Logic
function update(time, dt) {
    const params = paramsManager.getParams();
    Render.clear(ctx);

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const cx = w / 2;
    const cy = h / 2;

    const scale = params.zoom;
    const xRange = [-cx / scale, cx / scale];
    const yRange = [-cy / scale, cy / scale];

    // Theme Colors
    const colorAxis = Render.getThemeColor('--accent-primary');
    const colorRoot = Render.getThemeColor('--accent-tertiary');
    const colorText = Render.getThemeColor('--text-color');
    const colorTextMuted = Render.getThemeColor('--text-muted');

    Render.drawGrid(ctx, xRange, yRange, 1);

    // Draw Parabola
    ctx.beginPath();
    ctx.strokeStyle = colorAxis;
    ctx.lineWidth = 3;

    const step = 0.1;
    let first = true;
    for (let x = xRange[0]; x <= xRange[1]; x += step) {
        const y = params.a * x * x + params.b * x + params.c;
        const screenPos = Render.toScreen(x, y, ctx, xRange, yRange);
        if (first) {
            ctx.moveTo(screenPos.x, screenPos.y);
            first = false;
        } else {
            ctx.lineTo(screenPos.x, screenPos.y);
        }
    }
    ctx.stroke();

    const disc = params.b * params.b - 4 * params.a * params.c;
    let rootText = '';

    if (Math.abs(params.a) < 0.001) {
        if (Math.abs(params.b) > 0.001) {
            const root = -params.c / params.b;
            drawRoot(ctx, root, 0, xRange, yRange, colorRoot);
            rootText = Globals.getText('Linear Root', `Linear Root: x = ${root.toFixed(2)}`, `一次解: x = ${root.toFixed(2)}`);
        } else {
            rootText = Globals.getText('No roots', 'No roots', '解なし');
        }
    } else {
        if (disc >= 0) {
            const r1 = (-params.b + Math.sqrt(disc)) / (2 * params.a);
            const r2 = (-params.b - Math.sqrt(disc)) / (2 * params.a);

            drawRoot(ctx, r1, 0, xRange, yRange, colorRoot);
            drawRoot(ctx, r2, 0, xRange, yRange, colorRoot);

            rootText = Globals.getText('Real Roots',
                `Real Roots: x₁=${r1.toFixed(2)}, x₂=${r2.toFixed(2)}`,
                `実数解: x₁=${r1.toFixed(2)}, x₂=${r2.toFixed(2)}`
            );

            // Factored Form Text
            const aStr = params.a === 1 ? '' : params.a === -1 ? '-' : params.a.toFixed(1);
            const r1Str = r1 >= 0 ? `- ${r1.toFixed(2)}` : `+ ${Math.abs(r1).toFixed(2)}`;
            const r2Str = r2 >= 0 ? `- ${r2.toFixed(2)}` : `+ ${Math.abs(r2).toFixed(2)}`;

            Render.drawText(ctx, `f(x) = ${aStr}(x ${r1Str})(x ${r2Str})`, 20, 80, colorTextMuted, '16px monospace');

        } else {
            rootText = Globals.getText('Complex Roots', 'Complex Roots (D < 0)', '複素数解 (D < 0)');
            if (params.showComplex) {
                const realPart = -params.b / (2 * params.a);
                const imagPart = Math.sqrt(Math.abs(disc)) / (2 * params.a);

                const vx = realPart;
                const vy = params.a * vx * vx + params.b * vx + params.c;
                const vPos = Render.toScreen(vx, vy, ctx, xRange, yRange);
                Render.drawCircle(ctx, vPos.x, vPos.y, 4, colorRoot, true);

                Render.drawText(ctx, `Roots: ${realPart.toFixed(2)} ± ${Math.abs(imagPart).toFixed(2)}i`, 20, 50, colorRoot);
            }
        }
    }

    // Info Overlay
    Render.drawText(ctx, `y = ${params.a}x² + ${params.b}x + ${params.c}`, 20, 30, colorText, '18px monospace');
    Render.drawText(ctx, rootText, 20, 55, colorRoot);
}

function drawRoot(ctx, x, y, xRange, yRange, color) {
    const pos = Render.toScreen(x, y, ctx, xRange, yRange);
    Render.drawCircle(ctx, pos.x, pos.y, 6, color, true);
    Render.drawText(ctx, `(${x.toFixed(2)}, 0)`, pos.x + 10, pos.y - 10, color);
}
