/* 複素関数による座標変換を、入力平面と出力平面の対応として描画する。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Complex Math Helpers
const C = {
    add: (a, b) => ({ re: a.re + b.re, im: a.im + b.im }),
    sub: (a, b) => ({ re: a.re - b.re, im: a.im - b.im }),
    mul: (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re }),
    div: (a, b) => { // a / b
        const denom = b.re * b.re + b.im * b.im;
        return {
            re: (a.re * b.re + a.im * b.im) / denom,
            im: (a.im * b.re - a.re * b.im) / denom // Corrected sign: (re*im - im*re) -> wait, (ac+bd)/(c^2+d^2) + i(bc-ad)/(...)
            // a = u+vi, b = x+yi. (u+vi)(x-yi) = ux - uyi + vix + v(-1)y(-1)i^2 -> ux + vy + i(vx - uy)
            // Correction: im: (a.im * b.re - a.re * b.im) / denom
        };
    },
    exp: (z) => {
        const r = Math.exp(z.re);
        return { re: r * Math.cos(z.im), im: r * Math.sin(z.im) };
    },
    sin: (z) => {
        // sin(x+iy) = sin(x)cosh(y) + i cos(x)sinh(y)
        return {
            re: Math.sin(z.re) * Math.cosh(z.im),
            im: Math.cos(z.re) * Math.sinh(z.im)
        };
    },
    scale: (z, s) => ({ re: z.re * s, im: z.im * s })
};

// 2. Schema
const SCHEMA = {
    func: { label: 'Function', label_ja: '関数', type: 'select', options: ['z^2', 'e^z', '1/z', 'sin(z)', 'z^2 + c'], default: 'z^2', folder: 'Map' },
    gridDensity: { label: 'Grid Density', label_ja: 'グリッド密度', type: 'slider', min: 0.1, max: 1, step: 0.1, default: 0.5, folder: 'View' },
    c_re: { label: 'Re(c) [for z^2+c]', label_ja: '実部 c', type: 'slider', min: -2, max: 2, step: 0.1, default: 0, folder: 'Common' },
    c_im: { label: 'Im(c) [for z^2+c]', label_ja: '虚部 c', type: 'slider', min: -2, max: 2, step: 0.1, default: 1, folder: 'Common' }
};

// 3. Setup
const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');
const runtime = new LessonRuntime(update);

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
            'title': { en: 'Complex Analysis', ja: '複素解析' },
            'desc': { en: 'Conformal Mappings w = f(z)', ja: '等角写像 w = f(z)' },
            'share': { en: 'Share', ja: '共有' }
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });
    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');
});

// 4. Update
function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;

    // Split screen: Left = Input (z), Right = Output (w)
    const margin = 20;
    const size = Math.min((w - margin * 3) / 2, h - margin * 2);

    const zRect = { x: margin, y: (h - size) / 2, w: size, h: size };
    const wRect = { x: margin * 2 + size, y: (h - size) / 2, w: size, h: size };

    // Ranges for Z-plane (Input)
    const range = 3;
    const zRangeX = [-range, range];
    const zRangeY = [-range, range];

    drawPlane(ctx, zRect, zRangeX, zRangeY, 'z-plane');
    drawPlane(ctx, wRect, zRangeX, zRangeY, 'w-plane'); // Use same range scale for compare

    // Calculate & Draw Mapped Grid
    const step = p.gridDensity;
    const c = { re: p.c_re, im: p.c_im };

    const map = (z) => {
        if (p.func === 'z^2') {
            return C.mul(z, z);
        } else if (p.func === 'e^z') {
            return C.exp(z);
        } else if (p.func === '1/z') {
            return C.div({ re: 1, im: 0 }, z);
        } else if (p.func === 'sin(z)') {
            return C.sin(z);
        } else if (p.func === 'z^2 + c') {
            return C.add(C.mul(z, z), c);
        }
        return z;
    };

    ctx.lineWidth = 1;

    // Input Grid (Z) - Simple static grid
    // Actually we iterate grid lines in Z, draw them in Z (Left) and W (Right)

    // Vertical Lines in Z (Const X)
    for (let x = -range; x <= range; x += step) {
        // Draw in Z
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        const zStart = toScreenLocal(x, -range, zRect, zRangeX, zRangeY);
        const zEnd = toScreenLocal(x, range, zRect, zRangeX, zRangeY);
        ctx.moveTo(zStart.x, zStart.y);
        ctx.lineTo(zEnd.x, zEnd.y);
        ctx.stroke();

        // Draw in W (Mapped)
        ctx.strokeStyle = Render.getThemeColor('--accent-primary');
        ctx.beginPath();
        let first = true;
        for (let y = -range; y <= range; y += 0.1) { // Finer step for curves
            const z = { re: x, im: y };
            const uv = map(z);
            const wPos = toScreenLocal(uv.re, uv.im, wRect, zRangeX, zRangeY);

            // Clip
            if (wPos.x < wRect.x || wPos.x > wRect.x + wRect.w ||
                wPos.y < wRect.y || wPos.y > wRect.y + wRect.h) {
                first = true; continue;
            }

            if (first) { ctx.moveTo(wPos.x, wPos.y); first = false; }
            else { ctx.lineTo(wPos.x, wPos.y); }
        }
        ctx.stroke();
    }

    // Horizontal Lines in Z (Const Y)
    for (let y = -range; y <= range; y += step) {
        // Z
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        const zStart = toScreenLocal(-range, y, zRect, zRangeX, zRangeY);
        const zEnd = toScreenLocal(range, y, zRect, zRangeX, zRangeY);
        ctx.moveTo(zStart.x, zStart.y);
        ctx.lineTo(zEnd.x, zEnd.y);
        ctx.stroke();

        // W
        ctx.strokeStyle = Render.getThemeColor('--accent-tertiary');
        ctx.beginPath();
        let first = true;
        for (let x = -range; x <= range; x += 0.1) {
            const z = { re: x, im: y };
            const uv = map(z);
            const wPos = toScreenLocal(uv.re, uv.im, wRect, zRangeX, zRangeY);

            if (wPos.x < wRect.x || wPos.x > wRect.x + wRect.w ||
                wPos.y < wRect.y || wPos.y > wRect.y + wRect.h) {
                first = true; continue;
            }

            if (first) { ctx.moveTo(wPos.x, wPos.y); first = false; }
            else { ctx.lineTo(wPos.x, wPos.y); }
        }
        ctx.stroke();
    }
}

function drawPlane(ctx, rect, xRange, yRange, label) {
    ctx.strokeStyle = Render.getThemeColor('--grid-line');
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

    Render.drawText(ctx, label, rect.x + 10, rect.y + 20, Render.getThemeColor('--text-muted'));

    // Axes
    const origin = toScreenLocal(0, 0, rect, xRange, yRange);
    ctx.strokeStyle = Render.getThemeColor('--text-muted');

    if (origin.x >= rect.x && origin.x <= rect.x + rect.w) {
        ctx.beginPath(); ctx.moveTo(origin.x, rect.y); ctx.lineTo(origin.x, rect.y + rect.h); ctx.stroke();
    }
    if (origin.y >= rect.y && origin.y <= rect.y + rect.h) {
        ctx.beginPath(); ctx.moveTo(rect.x, origin.y); ctx.lineTo(rect.x + rect.w, origin.y); ctx.stroke();
    }
}

function toScreenLocal(x, y, rect, xRange, yRange) {
    // Map x in [min, max] to [rect.x, rect.x + rect.w]
    const sx = rect.x + ((x - xRange[0]) / (xRange[1] - xRange[0])) * rect.w;
    const sy = rect.y + rect.h - ((y - yRange[0]) / (yRange[1] - yRange[0])) * rect.h;
    return { x: sx, y: sy };
}
