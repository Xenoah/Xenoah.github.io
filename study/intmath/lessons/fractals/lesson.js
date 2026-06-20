/* フラクタルの反復計算と表示範囲をSCHEMAから制御する描画モジュール。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Schema
const SCHEMA = {
    type: { label: 'Set Type', label_ja: '集合の種類', type: 'select', options: ['Mandelbrot', 'Julia'], default: 'Mandelbrot', folder: 'Fractal' },
    maxIter: { label: 'Iterations', label_ja: '反復回数', type: 'slider', min: 20, max: 200, step: 10, default: 50, folder: 'Quality' },
    juliaRe: { label: 'Julia Re(c)', label_ja: 'Julia 実部 c', type: 'slider', min: -2, max: 2, step: 0.01, default: -0.4, folder: 'Julia Params' },
    juliaIm: { label: 'Julia Im(c)', label_ja: 'Julia 虚部 c', type: 'slider', min: -2, max: 2, step: 0.01, default: 0.6, folder: 'Julia Params' },
    colorScheme: { label: 'Color', label_ja: '配色', type: 'select', options: ['Classic', 'Fire', 'Ice'], default: 'Fire', folder: 'View' }
};

// 2. Setup
const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');

// Viewport State (Zoom/Pan)
let camera = { x: -0.5, y: 0, zoom: 3 }; // width in complex plane

// Mouse Interaction
let isDragging = false;
let startPos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    startPos = { x: e.offsetX, y: e.offsetY };
});

canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const dx = e.offsetX - startPos.x;
    const dy = e.offsetY - startPos.y;

    // Pan camera
    const scale = camera.zoom / canvas.width;
    camera.x -= dx * scale;
    camera.y += dy * scale; // Canvas Y is inverted relative to math Y? 
    // Math Y up, Canvas Y down. 
    // If I drag mouse down (dy > 0), I want to see content above, so camera moves down ("y" decreases in complex plane terms if Y is up)
    // Let's standard: complex plane y is UP. Canvas y is DOWN.
    // Screen to math: my = camera.y - (sy - h/2) * scale
    // If dragging DOWN (dy>0), content moves DOWN. So we are looking at UPPER part. Camera Y should INCREASE?

    startPos = { x: e.offsetX, y: e.offsetY };
    requestRender();
});

canvas.addEventListener('mouseup', () => { isDragging = false; });
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const zoomFactor = 1.1;
    if (e.deltaY < 0) camera.zoom /= zoomFactor; // Zoom In
    else camera.zoom *= zoomFactor; // Zoom Out
    requestRender();
});

document.getElementById('btn-share').addEventListener('click', () => {
    const url = paramsManager.serializeToUrl();
    navigator.clipboard.writeText(url).then(() => alert(Globals.getText('Link copied!', 'Link copied!', 'リンクをコピーしました！')));
});
window.addEventListener('resize', () => {
    Render.setupCanvas(canvas);
    requestRender();
});

// 3. Render Loop
// We don't use the standard animation loop for Fractals because it's expensive.
// We render on demand (param change or interaction).
// But for smooth Julia animation, we might want it.
// Let's use standard loop but throttle or downscale if animating? 
// For now, on demand + param change.

paramsManager.onChange(() => requestRender());

let renderReq = null;
function requestRender() {
    if (renderReq) cancelAnimationFrame(renderReq);
    renderReq = requestAnimationFrame(render);
}

function render() {
    const p = paramsManager.getParams();
    const width = canvas.width;
    const height = canvas.height;

    // Get Image Data
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    // Bounds
    const ratio = height / width;
    const w = camera.zoom;
    const h = w * ratio;

    const minRe = camera.x - w / 2;
    const maxRe = camera.x + w / 2;
    const minIm = camera.y - h / 2; // If Y up
    const maxIm = camera.y + h / 2;
    // Wait, canvas y=0 is top. 
    // Let's map sy=0 to maxIm, sy=height to minIm.

    const reStep = w / width;
    const imStep = h / height;

    // Color Palette Precalc
    const palette = [];
    for (let i = 0; i <= p.maxIter; i++) {
        if (i === p.maxIter) {
            palette[i] = [0, 0, 0]; // Interior
        } else {
            // Smooth coloring could go here
            let r, g, b;
            const t = i / p.maxIter;
            if (p.colorScheme === 'Fire') {
                r = Math.floor(255 * Math.sqrt(t));
                g = Math.floor(100 * t);
                b = Math.floor(20 * t); // Red-Orange
            } else if (p.colorScheme === 'Ice') {
                r = Math.floor(20 * t);
                g = Math.floor(150 * t);
                b = Math.floor(255 * Math.sqrt(t));
            } else {
                // Classic
                const c = (i * 5) % 255;
                r = c; g = c; b = c;
            }
            palette[i] = [r, g, b];
        }
    }

    // Loop Pixels
    let ptr = 0;
    for (let y = 0; y < height; y++) {
        // Map y to Im: Top (y=0) is maxIm
        const cim = maxIm - y * imStep;

        for (let x = 0; x < width; x++) {
            const cre = minRe + x * reStep;

            let iter = 0;
            let zre, zim, cre_curr, cim_curr;

            if (p.type === 'Mandelbrot') {
                zre = 0; zim = 0;
                cre_curr = cre; cim_curr = cim;
            } else {
                zre = cre; zim = cim;
                cre_curr = p.juliaRe; cim_curr = p.juliaIm;
            }

            while (zre * zre + zim * zim <= 4 && iter < p.maxIter) {
                const nextRe = zre * zre - zim * zim + cre_curr;
                const nextIm = 2 * zre * zim + cim_curr;
                zre = nextRe;
                zim = nextIm;
                iter++;
            }

            const col = palette[iter];
            data[ptr++] = col[0];
            data[ptr++] = col[1];
            data[ptr++] = col[2];
            data[ptr++] = 255; // Alpha
        }
    }

    ctx.putImageData(imgData, 0, 0);
}

// Initial render
requestRender();

Globals.subscribe(state => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Fractals', ja: 'フラクタル' },
            'desc': { en: 'Mandelbrot & Julia Sets', ja: 'マンデルブロ・ジュリア集合' },
            'share': { en: 'Share', ja: '共有' },
            'tip': { en: 'Click & Drag to Pan, Scroll to Zoom', ja: 'ドラッグで移動、スクロールで拡大' }
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });

    const tip = document.getElementById('tip');
    if (tip) tip.textContent = Globals.getText('tip', 'Click & Drag to Pan, Scroll to Zoom', 'ドラッグで移動、スクロールで拡大');

    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');
    requestRender();
});
