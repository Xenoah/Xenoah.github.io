/* 微分・積分のパラメーター可視化。数式条件はSCHEMA、描画はupdateへ集約する。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Functions
const FUNCTIONS = {
    'sin(x)': (x) => Math.sin(x),
    'x^2': (x) => x * x,
    'x^3 - x': (x) => x * x * x - x,
    'exp(x/2)': (x) => Math.exp(x / 2),
    'abs(x)': (x) => Math.abs(x),
    '1/x': (x) => 1 / x
};

// 2. Schema
const SCHEMA = {
    mode: { label: 'Mode', label_ja: 'モード', type: 'select', options: ['Derivative', 'Integral'], default: 'Derivative', folder: 'Concept' },
    func: { label: 'Function', label_ja: '関数', type: 'select', options: Object.keys(FUNCTIONS), default: 'sin(x)', folder: 'Concept' },

    // Derivative Params
    x0: { label: 'Target Point (x₀)', label_ja: '対象点 (x₀)', type: 'slider', min: -3, max: 3, step: 0.1, default: 0.5, folder: 'Common', precision: 2 },
    h: { label: 'Step Size (h)', label_ja: '刻み幅 (h)', type: 'slider', min: 0.01, max: 2, step: 0.01, default: 1, folder: 'Derivative' },

    // Integral Params
    a: { label: 'Start (a)', label_ja: '開始 (a)', type: 'slider', min: -3, max: 3, step: 0.1, default: 0, folder: 'Integral' },
    b: { label: 'End (b)', label_ja: '終了 (b)', type: 'slider', min: -3, max: 3, step: 0.1, default: Math.PI, folder: 'Integral' },
    n: { label: 'Partitions (N)', label_ja: '分割数 (N)', type: 'slider', min: 1, max: 50, step: 1, default: 10, folder: 'Integral' },
    method: { label: 'Method', label_ja: '手法', type: 'select', options: ['Left', 'Right', 'Midpoint', 'Trapezoid'], default: 'Left', folder: 'Integral' }
};

// 3. Setup
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
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Calculus', ja: '微分積分' },
            'desc': { en: 'Visualize derivatives, integrals and changing functions.', ja: '関数の変化、微分、積分の関係をグラフで操作しながら可視化します。' },
            'controls': { en: 'Controls', ja: '操作' },
            'share': { en: 'Share', ja: '共有' }
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });

    const playBtn = document.getElementById('btn-play');
    if (playBtn) playBtn.textContent = runtime.isRunning ?
        Globals.getText('Pause', 'Pause', '一時停止') :
        Globals.getText('Play', 'Play', '再生');
    document.getElementById('btn-reset').textContent = Globals.getText('Reset', 'Reset', 'リセット');
    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');
});

// 4. Update
function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const scale = 60;
    const cx = w / 2;
    const cy = h / 2;

    const xRange = [-cx / scale, cx / scale];
    const yRange = [-cy / scale, cy / scale];

    // Theme Colors
    const colGrid = Render.getThemeColor('--grid-line');
    const colText = Render.getThemeColor('--text-color');
    const colAccent1 = Render.getThemeColor('--accent-primary');
    const colAccent2 = Render.getThemeColor('--accent-tertiary');
    const colSecant = 'yellow'; // Or theme var if needed, kept hardcoded for visibility contrast

    Render.drawGrid(ctx, xRange, yRange, 1);

    const f = FUNCTIONS[p.func];

    // Draw Function Curve
    ctx.beginPath();
    ctx.strokeStyle = colText;
    ctx.lineWidth = 2;
    const step = 0.05;
    let first = true;
    for (let x = xRange[0]; x <= xRange[1]; x += step) {
        const y = f(x);
        if (Math.abs(y) > 10) { first = true; continue; }
        const pos = Render.toScreen(x, y, ctx, xRange, yRange);
        if (first) { ctx.moveTo(pos.x, pos.y); first = false; }
        else { ctx.lineTo(pos.x, pos.y); }
    }
    ctx.stroke();

    if (p.mode === 'Derivative') {
        renderDerivative(ctx, p, f, xRange, yRange, cx, cy, scale, colSecant, colAccent1, colAccent2);
    } else {
        renderIntegral(ctx, p, f, xRange, yRange, cx, cy, scale, colAccent1);
    }
}

function renderDerivative(ctx, p, f, xRange, yRange, cx, cy, scale, colSecant, colTrue, colError) {
    const x0 = p.x0;
    const x1 = x0 + p.h;
    const y0 = f(x0);
    const y1 = f(x1);

    const p0 = Render.toScreen(x0, y0, ctx, xRange, yRange);
    const p1 = Render.toScreen(x1, y1, ctx, xRange, yRange);

    Render.drawCircle(ctx, p0.x, p0.y, 4, colSecant, true);
    Render.drawCircle(ctx, p1.x, p1.y, 4, colSecant, true);

    // Secant
    ctx.beginPath();
    ctx.strokeStyle = colSecant;
    ctx.lineWidth = 1;
    const slope = (y1 - y0) / (x1 - x0);

    const farLeftX = xRange[0];
    const farLeftY = slope * (farLeftX - x0) + y0;
    const farRightX = xRange[1];
    const farRightY = slope * (farRightX - x0) + y0;

    const s0 = Render.toScreen(farLeftX, farLeftY, ctx, xRange, yRange);
    const s1 = Render.toScreen(farRightX, farRightY, ctx, xRange, yRange);

    ctx.moveTo(s0.x, s0.y);
    ctx.lineTo(s1.x, s1.y);
    ctx.stroke();

    // True Tangent
    const epsilon = 0.0001;
    const trueSlope = (f(x0 + epsilon) - f(x0)) / epsilon;

    ctx.beginPath();
    ctx.strokeStyle = colTrue;
    ctx.setLineDash([5, 5]);
    const tYL = trueSlope * (farLeftX - x0) + y0;
    const tYR = trueSlope * (farRightX - x0) + y0;
    const t0 = Render.toScreen(farLeftX, tYL, ctx, xRange, yRange);
    const t1 = Render.toScreen(farRightX, tYR, ctx, xRange, yRange);
    ctx.moveTo(t0.x, t0.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Triangle
    ctx.beginPath();
    ctx.strokeStyle = Render.getThemeColor('--text-muted');
    ctx.moveTo(p0.x, p0.y);
    const corner = Render.toScreen(x1, y0, ctx, xRange, yRange);
    ctx.lineTo(corner.x, corner.y); // Run
    ctx.lineTo(p1.x, p1.y); // Rise
    ctx.stroke();

    Render.drawText(ctx, `Δx = ${p.h.toFixed(2)}`, corner.x - 20, corner.y + 15, Render.getThemeColor('--text-muted'));
    Render.drawText(ctx, `Δy = ${(y1 - y0).toFixed(2)}`, p1.x + 5, (p0.y + p1.y) / 2, Render.getThemeColor('--text-muted'));

    // Info
    const tSecant = Globals.getText('Slope (Secant)', `Slope (Secant): ${slope.toFixed(4)}`, `傾き (割線): ${slope.toFixed(4)}`);
    const tTan = Globals.getText('True Derivative', `True Derivative: ${trueSlope.toFixed(4)}`, `真の微分係数: ${trueSlope.toFixed(4)}`);
    const tErr = Globals.getText('Error', `Error: ${(Math.abs(slope - trueSlope)).toFixed(5)}`, `誤差: ${(Math.abs(slope - trueSlope)).toFixed(5)}`);

    Render.drawText(ctx, tSecant, 20, 30, colSecant);
    Render.drawText(ctx, tTan, 20, 50, colTrue);
    Render.drawText(ctx, tErr, 20, 70, colError);
}

function renderIntegral(ctx, p, f, xRange, yRange, cx, cy, scale, colHighlight) {
    const a = Math.min(p.a, p.b);
    const b = Math.max(p.a, p.b);
    const n = Math.floor(p.n);
    const dx = (b - a) / n;

    let sum = 0;

    // Use semi-transparent fill
    // We can't easily get rgba from hex var in generic way without parsing, 
    // so let's just stick to a fixed opacity fill based on the accent color if possible, 
    // or just use hardcoded transparent cyan/blue that looks ok in both modes
    ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
    ctx.strokeStyle = colHighlight;

    for (let i = 0; i < n; i++) {
        const xStart = a + i * dx;
        const xEnd = xStart + dx;

        let h;
        if (p.method === 'Left') h = f(xStart);
        else if (p.method === 'Right') h = f(xEnd);
        else if (p.method === 'Midpoint') h = f((xStart + xEnd) / 2);
        else if (p.method === 'Trapezoid') h = (f(xStart) + f(xEnd)) / 2;

        if (p.method === 'Trapezoid') {
            const h1 = f(xStart);
            const h2 = f(xEnd);
            const p1 = Render.toScreen(xStart, 0, ctx, xRange, yRange);
            const p2 = Render.toScreen(xEnd, 0, ctx, xRange, yRange);
            const p3 = Render.toScreen(xEnd, h2, ctx, xRange, yRange);
            const p4 = Render.toScreen(xStart, h1, ctx, xRange, yRange);

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y);
            ctx.lineTo(p4.x, p4.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            sum += dx * (h1 + h2) / 2;
        } else {
            const pos = Render.toScreen(xStart, h >= 0 ? h : 0, ctx, xRange, yRange);
            const origin = Render.toScreen(xStart, 0, ctx, xRange, yRange);
            const val = Render.toScreen(xStart, h, ctx, xRange, yRange);

            const drawX = origin.x;
            const drawY = Math.min(origin.y, val.y);
            const sw = dx * scale;
            const drawH = Math.abs(origin.y - val.y);

            ctx.fillRect(drawX, drawY, sw, drawH);
            ctx.strokeRect(drawX, drawY, sw, drawH);

            sum += dx * h;
        }
    }

    const tArea = Globals.getText('Area', `Area (Approx): ${sum.toFixed(4)}`, `面積 (近似): ${sum.toFixed(4)}`);
    Render.drawText(ctx, tArea, 20, 30, colHighlight);
    Render.drawText(ctx, `Interval: [${a.toFixed(2)}, ${b.toFixed(2)}]`, 20, 50, Render.getThemeColor('--text-muted'));
    Render.drawText(ctx, `Step dx: ${dx.toFixed(3)}`, 20, 70, Render.getThemeColor('--text-muted'));
}
