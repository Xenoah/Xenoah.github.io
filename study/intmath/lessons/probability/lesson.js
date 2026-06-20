/* モンテカルロ法とサイコロ和の分布を、同じ反復シミュレーション枠で扱う。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

const SCHEMA = {
    mode: { label: 'Simulation', label_ja: 'シミュレーション', type: 'select', options: ['Monte Carlo Pi', 'Dice Sum (CLT)'], default: 'Monte Carlo Pi', folder: 'Mode' },
    speed: { label: 'Speed', label_ja: '速度', type: 'slider', min: 1, max: 100, step: 1, default: 10, folder: 'Simulation' },

    // サイコロ和モードだけで使う分布条件。
    diceCount: { label: 'Dice Count', label_ja: 'サイコロの数', type: 'slider', min: 1, max: 10, step: 1, default: 2, folder: 'Dice' },
    sides: { label: 'Sides', label_ja: '面数', type: 'slider', min: 2, max: 20, step: 1, default: 6, folder: 'Dice' }
};

const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');

let points = []; // 円内外を含むモンテカルロ点
let histogram = {}; // サイコロ和ごとの出現回数
let totalRolls = 0;

const initSim = () => {
    points = [];
    histogram = {};
    totalRolls = 0;

    // 0件の和も軸へ表示できるよう、取り得る範囲を先に0で埋める。
    const p = paramsManager.getParams();
    if (p.mode === 'Dice Sum (CLT)') {
        const min = p.diceCount * 1;
        const max = p.diceCount * p.sides;
        for (let i = min; i <= max; i++) histogram[i] = 0;
    }
    updateStats();
};

const runtime = new LessonRuntime(update);
runtime.bindControls('btn-play', 'btn-reset');
document.getElementById('btn-reset').addEventListener('click', initSim);
// 条件変更前後の試行を混ぜないため、パラメーター変更時は集計を初期化する。
paramsManager.onChange(initSim);
initSim();

Globals.subscribe(state => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Probability', ja: '確率・統計' },
            'desc': { en: 'Monte Carlo & CLT', ja: 'モンテカルロ法と中心極限定理' },
            'share': { en: 'Share', ja: '共有' },
            'controls': { en: 'Controls', ja: '操作' },
            'stats': { en: 'Results', ja: '結果' },
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

document.getElementById('btn-share').addEventListener('click', () => {
    const url = paramsManager.serializeToUrl();
    navigator.clipboard.writeText(url).then(() => alert(Globals.getText('Link copied!', 'Link copied!', 'リンクをコピーしました！')));
});
window.addEventListener('resize', () => Render.setupCanvas(canvas));

function updateStats() {
    const el = document.getElementById('stats-output');
    const p = paramsManager.getParams();
    if (p.mode === 'Monte Carlo Pi') {
        const total = points.length;
        const inside = points.filter(pt => pt.in).length;
        const piEst = total > 0 ? (inside / total) * 4 : 0;
        el.innerHTML = `N: ${total}<br>π ≈ ${piEst.toFixed(5)}<br>Err: ${Math.abs(Math.PI - piEst).toFixed(5)}`;
    } else {
        el.innerHTML = `N: ${totalRolls}<br>Mean: ${(totalRolls > 0 ? getMean() : 0).toFixed(2)}`;
    }
}

function getMean() {
    let sum = 0;
    for (const [k, v] of Object.entries(histogram)) {
        sum += parseInt(k) * v;
    }
    return sum / totalRolls;
}

function update(time, dt) {
    const p = paramsManager.getParams();
    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const cx = w / 2;
    const cy = h / 2;

    // speedを1フレームあたりの試行数として扱う。
    const batch = p.speed;

    if (p.mode === 'Monte Carlo Pi') {
        // 正方形[-1,1]²へ一様乱数を打ち、単位円内の比率からπを推定する。
        for (let i = 0; i < batch; i++) {
            const x = Math.random() * 2 - 1;
            const y = Math.random() * 2 - 1;
            const inCircle = (x * x + y * y) <= 1;
            points.push({ x, y, in: inCircle });
        }
        // 描画点数の上限は将来の集計値分離時に設ける。現状は試行点を全保持する。
        if (points.length > 10000) {
        }
    } else {
        // 独立なサイコロの和をヒストグラムへ加算する。
        for (let i = 0; i < batch; i++) {
            let sum = 0;
            for (let d = 0; d < p.diceCount; d++) {
                sum += Math.floor(Math.random() * p.sides) + 1;
            }
            histogram[sum] = (histogram[sum] || 0) + 1;
            totalRolls++;
        }
    }

    updateStats();
    Render.clear(ctx);

    if (p.mode === 'Monte Carlo Pi') {
        // 円と正方形を同じ縮尺で描き、内外判定の領域を示す。
        const size = Math.min(w, h) * 0.8;
        const r = size / 2;

        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - r, cy - r, size, size);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Draw Points (limit visuals for perf)
        const visLimit = 5000;
        const start = Math.max(0, points.length - visLimit);

        for (let i = start; i < points.length; i++) {
            const pt = points[i];
            const px = cx + pt.x * r;
            const py = cy + pt.y * r; // y down is fine, symmetric

            ctx.fillStyle = pt.in ? Render.getThemeColor('--accent-primary') : Render.getThemeColor('--accent-secondary');
            ctx.fillRect(px, py, 2, 2);
        }
    } else {
        // Draw Histogram
        const margin = 50;
        const graphW = w - margin * 2;
        const graphH = h - margin * 2;
        const bottomY = h - margin;
        const leftX = margin;

        const keys = Object.keys(histogram).map(Number).sort((a, b) => a - b);
        if (keys.length === 0) return;

        const minVal = keys[0];
        const maxVal = keys[keys.length - 1];
        const countRange = keys.length;

        // Find max freq
        let maxFreq = 0;
        for (const k of keys) maxFreq = Math.max(maxFreq, histogram[k]);
        if (maxFreq === 0) maxFreq = 1;

        const barW = graphW / countRange;

        ctx.fillStyle = Render.getThemeColor('--text-color');

        // Axis
        Render.drawLine(ctx, leftX, bottomY, leftX + graphW, bottomY, 'white', 1);

        keys.forEach((k, i) => {
            const val = histogram[k];
            const barH = (val / maxFreq) * graphH;

            const x = leftX + i * barW;
            const y = bottomY - barH;

            ctx.fillStyle = Render.getThemeColor('--accent-primary'); // Solid color
            ctx.fillRect(x + 2, y, barW - 4, barH);

            // Label
            Render.drawText(ctx, k.toString(), x + barW / 2 - 5, bottomY + 20, 'white', '12px monospace');
        });

        // Expected Curve (Normal Distribution) overlay?
        // Skip for now, visuals are good enough
    }
}
