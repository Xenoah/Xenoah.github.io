import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Define Schema
const SCHEMA = {
    omega: { label: 'Angular Velocity (ω)', label_ja: '角速度 (ω)', type: 'slider', min: -5, max: 5, step: 0.1, default: 1, folder: 'Physics' },
    phase: { label: 'Phase (φ)', label_ja: '位相 (φ)', type: 'slider', min: 0, max: 6.28, step: 0.1, default: 0, folder: 'Physics' },
    radius: { label: 'Radius', label_ja: '半径', type: 'slider', min: 0.5, max: 2, step: 0.1, default: 1, folder: 'Geometry' },
    showExtensions: { label: 'Show Extensions', label_ja: '補助線を表示', type: 'toggle', default: true, folder: 'Appearance' },
    showWaveform: { label: 'Show Waveform', label_ja: '波形を表示', type: 'toggle', default: true, folder: 'Appearance' },
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

// Setup Control Text Updates
Globals.subscribe(state => {
    document.getElementById('btn-play').textContent = runtime.isRunning ?
        Globals.getText('Pause', 'Pause', '一時停止') :
        Globals.getText('Play', 'Play', '再生');
    document.getElementById('btn-reset').textContent = Globals.getText('Reset', 'Reset', 'リセット');
    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');

    // Also update headers manually if we want, or use data-i18n in HTML
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        // Simple manual dictionary for this file
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Unit Circle', ja: '単位円' },
            'playback': { en: 'Playback', ja: '再生操作' },
            'share': { en: 'Share', ja: '共有' }
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });
});

// Resize Handler
window.addEventListener('resize', () => Render.setupCanvas(canvas));

// History buffer for waveform
const history = [];
const HISTORY_MAX = 500;

// 3. Update Loop
function update(time, dt) {
    const params = paramsManager.getParams();

    // Clear
    Render.clear(ctx);

    // Calculate State
    const currentAngle = params.omega * time + params.phase;
    const px = Math.cos(currentAngle) * params.radius;
    const py = Math.sin(currentAngle) * params.radius;

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const cx = w * 0.3;
    const cy = h * 0.5;
    const scale = Math.min(w, h) * 0.25;

    // Grid
    const gridColor = Render.getThemeColor('--grid-line');
    const textColor = Render.getThemeColor('--text-color');

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(w, cy); // X Axis
    ctx.moveTo(cx, 0); ctx.lineTo(cx, h); // Y Axis
    ctx.stroke();

    // The Circle
    Render.drawCircle(ctx, cx, cy, params.radius * scale, gridColor);

    // The Point
    const screenPx = cx + px * scale;
    const screenPy = cy - py * scale;

    Render.drawLine(ctx, cx, cy, screenPx, screenPy, textColor);

    // Projections
    if (params.showExtensions) {
        ctx.setLineDash([5, 5]);
        Render.drawLine(ctx, screenPx, screenPy, screenPx, cy, Render.getThemeColor('--accent-primary')); // Cos
        Render.drawLine(ctx, screenPx, screenPy, cx, screenPy, Render.getThemeColor('--accent-secondary')); // Sin
        ctx.setLineDash([]);
    }

    Render.drawCircle(ctx, screenPx, screenPy, 6, textColor, true);

    // Waveform
    if (params.showWaveform) {
        history.unshift({ y: py, t: time });
        if (history.length > HISTORY_MAX) history.pop();

        ctx.beginPath();
        const waveStartX = cx + scale * 2.5;
        const timeScale = 50;

        ctx.strokeStyle = Render.getThemeColor('--accent-secondary');
        ctx.lineWidth = 2;

        let first = true;
        for (let i = 0; i < history.length; i++) {
            const point = history[i];
            const x = waveStartX + (time - point.t) * timeScale;
            const y = cy - point.y * scale;

            if (x > w) break;

            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        if (params.showExtensions && history.length > 0) {
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = Render.getThemeColor('--accent-secondary');
            ctx.beginPath();
            ctx.moveTo(screenPx, screenPy);
            const waveCurrentX = waveStartX;
            ctx.lineTo(waveCurrentX, screenPy);
            ctx.stroke();
            ctx.setLineDash([]);

            Render.drawCircle(ctx, waveCurrentX, screenPy, 4, Render.getThemeColor('--accent-secondary'), true);
        }
    }

    // Data Overlay
    Render.drawText(ctx, `θ = ${currentAngle.toFixed(2)} rad`, 20, 30, textColor);
    Render.drawText(ctx, `sin(θ) = ${py.toFixed(3)}`, 20, 50, Render.getThemeColor('--accent-secondary'));
    Render.drawText(ctx, `cos(θ) = ${px.toFixed(3)}`, 20, 70, Render.getThemeColor('--accent-primary'));
}
