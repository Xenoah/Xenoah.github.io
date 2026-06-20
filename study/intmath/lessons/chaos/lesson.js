/* ローレンツ系と二重振り子を同じ描画ループで比較するカオス可視化。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

const SCHEMA = {
    system: { label: 'System', label_ja: 'システム', type: 'select', options: ['Lorenz Attractor', 'Double Pendulum'], default: 'Lorenz Attractor', folder: 'Model' },
    speed: { label: 'Simulation Speed', label_ja: '速度', type: 'slider', min: 1, max: 10, step: 1, default: 2, folder: 'Model' },
    trailLength: { label: 'Trail Length', label_ja: '軌跡の長さ', type: 'slider', min: 100, max: 2000, step: 100, default: 800, folder: 'View' },

    // ローレンツ系を選んだ場合だけ意味を持つ係数。
    sigma: { label: 'Sigma (σ)', type: 'slider', min: 0, max: 20, step: 0.1, default: 10, folder: 'Lorenz' },
    rho: { label: 'Rho (ρ)', type: 'slider', min: 0, max: 50, step: 1, default: 28, folder: 'Lorenz' },
    beta: { label: 'Beta (β)', type: 'slider', min: 0, max: 5, step: 0.1, default: 2.66, folder: 'Lorenz' }
};

const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');
let points = [];
let state = null;

// モデル切替時は状態の構造が異なるため、軌跡と初期条件を同時に作り直す。
const initSystem = () => {
    const p = paramsManager.getParams();
    points = [];
    if (p.system === 'Lorenz Attractor') {
        state = { x: 0.1, y: 0, z: 0 };
    } else {
        // 二重振り子は角度と角速度を状態として保持する。
        state = { t1: Math.PI / 2, t2: Math.PI / 2, p1: 0, p2: 0 };
    }
};

const runtime = new LessonRuntime((t, dt) => update(t, dt));
runtime.bindControls('btn-play', 'btn-reset');
document.getElementById('btn-reset').addEventListener('click', initSystem);
paramsManager.onChange(() => {
    // モデルと現在stateの形が一致しない場合だけ初期化する。
    const p = paramsManager.getParams();
    if ((p.system === 'Lorenz Attractor' && state.t1 !== undefined) ||
        (p.system === 'Double Pendulum' && state.x !== undefined)) {
        initSystem();
    }
});

initSystem();

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
            'title': { en: 'Chaos Theory', ja: 'カオス理論' },
            'desc': { en: 'Sensitivity to initial conditions', ja: '初期値鋭敏性' },
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

// ローレンツ方程式を固定刻みのオイラー法で1ステップ進める。
function lorenz(s, dt, sigma, rho, beta) {
    const dx = sigma * (s.y - s.x);
    const dy = s.x * (rho - s.z) - s.y;
    const dz = s.x * s.y - beta * s.z;
    return {
        x: s.x + dx * dt,
        y: s.y + dy * dt,
        z: s.z + dz * dt
    };
}

function doublePendulum(s, dt) {
    // 質量・長さ・重力を1へ正規化した二重振り子の運動方程式を使う。
    const g = 1;

    // stateは2本の角度t1/t2と角速度w1/w2で統一する。
    if (s.w1 === undefined) { s.w1 = 0; s.w2 = 0; }

    const m1 = 1, m2 = 1, l1 = 1, l2 = 1;

    const num1 = -g * (2 * m1 + m2) * Math.sin(s.t1);
    const num2 = -m2 * g * Math.sin(s.t1 - 2 * s.t2);
    const num3 = -2 * Math.sin(s.t1 - s.t2) * m2;
    const num4 = s.w2 * s.w2 * l2 + s.w1 * s.w1 * l1 * Math.cos(s.t1 - s.t2);
    const den = l1 * (2 * m1 + m2 - m2 * Math.cos(2 * s.t1 - 2 * s.t2));
    const a1 = (num1 + num2 + num3 * num4) / den;

    const num5 = 2 * Math.sin(s.t1 - s.t2);
    const num6 = (s.w1 * s.w1 * l1 * (m1 + m2));
    const num7 = g * (m1 + m2) * Math.cos(s.t1);
    const num8 = s.w2 * s.w2 * l2 * m2 * Math.cos(s.t1 - s.t2);
    const den2 = l2 * (2 * m1 + m2 - m2 * Math.cos(2 * s.t1 - 2 * s.t2));
    const a2 = (num5 * (num6 + num7 + num8)) / den2;

    return {
        t1: s.t1 + s.w1 * dt,
        t2: s.t2 + s.w2 * dt,
        w1: s.w1 + a1 * dt,
        w2: s.w2 + a2 * dt
    };
}

function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const cx = w / 2;
    const cy = h / 2;

    // 表示フレームごとに複数回進め、速度変更を積分回数として反映する。
    const steps = p.speed;
    const simDt = 0.01;

    for (let i = 0; i < steps; i++) {
        if (p.system === 'Lorenz Attractor') {
            state = lorenz(state, simDt, p.sigma, p.rho, p.beta);
        } else {
            state = doublePendulum(state, simDt);
        }
        points.push({ ...state });
        if (points.length > p.trailLength) points.shift();
    }

    if (p.system === 'Lorenz Attractor') {
        // 3次元軌跡を固定視点から2次元へ投影する。
        // Rotate viewing angle slowly
        const angle = time * 0.2;
        const scale = 10;

        ctx.strokeStyle = Render.getThemeColor('--accent-primary');
        ctx.beginPath();

        // Simple rotation around Z
        const rotX = (x, y) => x * Math.cos(angle) - y * Math.sin(angle);
        const rotY = (x, y) => x * Math.sin(angle) + y * Math.cos(angle);

        let first = true;
        for (const pt of points) {
            // Center lorenz roughly at 0,0,25?
            const x = pt.x;
            const y = pt.y;
            const z = pt.z - p.rho; // Center vertically

            const rx = rotX(x, y);
            const ry = rotY(x, y); // Flatten Z? No, rotate X/Y
            // Actually lorenz is nice rotating around vertical axis (Z)
            // So we modify x and y

            const px = cx + rx * scale;
            const py = cy - z * scale;

            if (first) { ctx.moveTo(px, py); first = false; }
            else { ctx.lineTo(px, py); }
        }
        ctx.stroke();

        Render.drawText(ctx, `Points: ${points.length}`, 20, 30);
    }
    else {
        // Double Pendulum
        const scale = 150; // Pixels per meter
        const l1 = 1 * scale;
        const l2 = 1 * scale;

        // Calculate current pos
        const x1 = cx + l1 * Math.sin(state.t1);
        const y1 = cy + l1 * Math.cos(state.t1);

        const x2 = x1 + l2 * Math.sin(state.t2);
        const y2 = y1 + l2 * Math.cos(state.t2);

        // Grid/Trail
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.beginPath();
        let first = true;
        for (const pt of points) {
            const px1 = cx + l1 * Math.sin(pt.t1);
            const py1 = cy + l1 * Math.cos(pt.t1);
            const px2 = px1 + l2 * Math.sin(pt.t2);
            const py2 = py1 + l2 * Math.cos(pt.t2);

            if (first) { ctx.moveTo(px2, py2); first = false; }
            else { ctx.lineTo(px2, py2); }
        }
        ctx.stroke();

        // Rods
        Render.drawLine(ctx, cx, cy, x1, y1, 'white', 2);
        Render.drawLine(ctx, x1, y1, x2, y2, 'white', 2);

        // Masses
        Render.drawCircle(ctx, cx, cy, 5, 'white', true);
        Render.drawCircle(ctx, x1, y1, 10, Render.getThemeColor('--accent-primary'), true);
        Render.drawCircle(ctx, x2, y2, 10, Render.getThemeColor('--accent-primary'), true);
    }
}
