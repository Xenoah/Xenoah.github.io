import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Schema
const SCHEMA = {
    dimension: { label: 'Object', label_ja: 'オブジェクト', type: 'select', options: ['Cube (3D)', 'Tesseract (4D)'], default: 'Tesseract (4D)', folder: 'Geometry' },
    speed: { label: 'Rotation Speed', label_ja: '回転速度', type: 'slider', min: 0, max: 2, step: 0.1, default: 0.5, folder: 'Animation' },
    perspective: { label: 'Perspective', label_ja: '遠近感', type: 'slider', min: 1, max: 5, step: 0.1, default: 2, folder: 'View' },
    scale: { label: 'Scale', label_ja: 'スケール', type: 'slider', min: 50, max: 200, step: 10, default: 100, folder: 'View' }
};

// 2. Setup
const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');
const runtime = new LessonRuntime(update);

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
            'title': { en: 'High Dimensions', ja: '高次元座標' },
            'desc': { en: 'Projecting 3D and 4D objects onto 2D screen.', ja: '3D/4Dオブジェクトの2D投影' },
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

// 3. Geometry (Shared, no I18n needed)
function generateHypercube(d) {
    const vertices = [];
    const count = Math.pow(2, d);
    for (let i = 0; i < count; i++) {
        const v = [];
        for (let j = 0; j < d; j++) {
            v.push((i & (1 << j)) ? 1 : -1);
        }
        vertices.push(v);
    }
    const edges = [];
    for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) {
            let diff = 0;
            const temp = i ^ j;
            let check = temp;
            while (check > 0) {
                if (check & 1) diff++;
                check >>= 1;
            }
            if (diff === 1) {
                edges.push([i, j]);
            }
        }
    }
    return { vertices, edges };
}
const geometry3D = generateHypercube(3);
const geometry4D = generateHypercube(4);

// 4. Matrix Math 
function rotate(v, time, d) {
    let res = [...v];
    const angle = time;
    const rot2D = (x, y, theta) => {
        return [
            x * Math.cos(theta) - y * Math.sin(theta),
            x * Math.sin(theta) + y * Math.cos(theta)
        ];
    };

    if (d === 4) {
        const xy = rot2D(res[0], res[1], angle);
        res[0] = xy[0]; res[1] = xy[1];
        const zw = rot2D(res[2], res[3], angle * 0.5);
        res[2] = zw[0]; res[3] = zw[1];
        const xz = rot2D(res[0], res[2], angle * 0.2);
        res[0] = xz[0]; res[2] = xz[1];
    } else {
        const xz = rot2D(res[0], res[2], angle);
        res[0] = xz[0]; res[2] = xz[1];
        const xy = rot2D(res[0], res[1], angle * 0.3);
        res[0] = xy[0]; res[1] = xy[1];
    }
    return res;
}

function project(v, d, dist, scale) {
    let currentV = [...v];
    if (d === 4) {
        const w = currentV[3];
        const distance = 3;
        const zScale = 1 / (distance - w);
        currentV = [currentV[0] * zScale, currentV[1] * zScale, currentV[2] * zScale];
    }
    const z = currentV[2];
    const zScale = 1 / (dist - z);
    return { x: currentV[0] * zScale * scale, y: currentV[1] * zScale * scale };
}

// 5. Update
function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const cx = w / 2;
    const cy = h / 2;

    const is4D = p.dimension.includes('4D');
    const geo = is4D ? geometry4D : geometry3D;
    const dim = is4D ? 4 : 3;

    // Theme
    const colEdges = Render.getThemeColor('--accent-primary');
    const colVerts = Render.getThemeColor('--accent-secondary');
    const colText = Render.getThemeColor('--text-color');
    const colMuted = Render.getThemeColor('--text-muted');

    const computedVerts = geo.vertices.map(v => {
        const rv = rotate(v, time * p.speed, dim);
        const proj = project(rv, dim, p.perspective, p.scale);
        return { x: cx + proj.x, y: cy + proj.y };
    });

    ctx.beginPath();
    ctx.strokeStyle = colEdges;
    ctx.lineWidth = 1;

    for (const [idx1, idx2] of geo.edges) {
        const p1 = computedVerts[idx1];
        const p2 = computedVerts[idx2];
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
    }
    ctx.stroke();

    for (const v of computedVerts) {
        Render.drawCircle(ctx, v.x, v.y, 3, colVerts, true);
    }

    Render.drawText(ctx, `${p.dimension}`, 20, 30, colText);
    Render.drawText(ctx, `${Globals.getText('Vertices', 'Vertices', '頂点数')}: ${geo.vertices.length}`, 20, 50, colMuted);
    Render.drawText(ctx, `${Globals.getText('Edges', 'Edges', '辺の数')}: ${geo.edges.length}`, 20, 70, colMuted);
}
