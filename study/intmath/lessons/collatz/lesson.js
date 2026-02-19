import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Schema
const SCHEMA = {
    startN: { label: 'Start Number', label_ja: '開始数', type: 'slider', min: 2, max: 1000, step: 1, default: 27, folder: 'Sequence' },
    showTree: { label: 'Show Tree (1-N)', label_ja: 'ツリー表示 (1-N)', type: 'toggle', default: false, folder: 'View' },
    scaleY: { label: 'Y Scale (Log)', label_ja: 'Y軸 (対数)', type: 'toggle', default: false, folder: 'View' }
};

// 2. Setup
const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');

// Calc Logic
function getSequence(n) {
    const seq = [n];
    let curr = n;
    while (curr > 1) {
        if (curr % 2 === 0) curr = curr / 2;
        else curr = 3 * curr + 1;
        seq.push(curr);
    }
    return seq;
}

const updateStats = (seq) => {
    document.getElementById('stats-output').innerHTML = 
        `${Globals.getText('Steps', 'Steps', 'ステップ数')}: ${seq.length - 1}<br>` + 
        `${Globals.getText('Max Value', 'Max Value', '最大値')}: ${Math.max(...seq)}`;
};

const runtime = new LessonRuntime(update); // Animation for drawing graph step by step? 
// Or just static. Static is fine for now, or animated path.

// UI
Globals.subscribe(state => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Collatz Conjecture', ja: 'コラッツ予想' },
            'desc': { en: 'The 3n+1 Problem', ja: '3n+1 問題' },
            'share': { en: 'Share', ja: '共有' },
            'stats': { en: 'Results', ja: '結果' },
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });
    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');
});

document.getElementById('btn-share').addEventListener('click', () => {
    const url = paramsManager.serializeToUrl();
    navigator.clipboard.writeText(url).then(() => alert(Globals.getText('Link copied!', 'Link copied!', 'リンクをコピーしました！')));
});
window.addEventListener('resize', () => Render.setupCanvas(canvas));

// 3. Render
function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);
    
    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const padding = 50;
    
    if (!p.showTree) {
        // Single Sequence Graph
        const seq = getSequence(p.startN);
        updateStats(seq);
        
        const count = seq.length;
        const maxVal = Math.max(...seq);
        
        ctx.strokeStyle = Render.getThemeColor('--accent-primary');
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        for (let i = 0; i < count; i++) {
            const x = padding + (i / (count - 1)) * (w - padding * 2);
            let val = seq[i];
            
            let yNorm;
            if (p.scaleY) {
                // Log scale
                yNorm = Math.log(val) / Math.log(maxVal);
                if (maxVal === 1) yNorm = 0; // Handle start=1
            } else {
                yNorm = val / maxVal;
            }
            
            const y = (h - padding) - yNorm * (h - padding * 2);
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            // Draw Point
            Render.drawCircle(ctx, x, y, 3, 'white', true);
        }
        ctx.stroke();
        
        // Axes labels
        Render.drawText(ctx, '0', padding, h - padding + 20, 'white');
        Render.drawText(ctx, (count-1).toString(), w - padding, h - padding + 20, 'white');
        Render.drawText(ctx, maxVal.toString(), 10, padding, 'white');
        
    } else {
        // Tree View (Reverse Collatz Tree? Or just many lines?)
        // Many lines from 1 to N is messy.
        // Let's do Reverse Tree (1 -> 2 -> 4...) visual?
        // Or just "Seaweed" graph: x=step, y=value for all N up to startN
        // Seaweed is cool.
        
        updateStats([0]); // Clear
        
        ctx.globalAlpha = 0.3;
        const maxStart = p.startN; // Use slider as range limit
        
        // Optimize: Start small
        const range = Math.min(maxStart, 200); 
        
        // Pre-calc max step/val to normalize
        let globalMaxStep = 0;
        let globalMaxVal = 0;
        const cache = [];
        
        for (let n = 2; n <= range; n++) {
             const seq = getSequence(n);
             cache.push(seq);
             globalMaxStep = Math.max(globalMaxStep, seq.length);
             globalMaxVal = Math.max(globalMaxVal, Math.max(...seq));
        }
        
        for (const seq of cache) {
            ctx.beginPath();
            ctx.strokeStyle = `hsl(${(seq[0] * 5) % 360}, 70%, 50%)`;
            
             for (let i = 0; i < seq.length; i++) {
                const x = padding + (i / globalMaxStep) * (w - padding * 2);
                let val = seq[i];
                
                let yNorm;
                 if (p.scaleY) {
                    yNorm = Math.log(val) / Math.log(globalMaxVal);
                } else {
                    yNorm = val / globalMaxVal;
                }
                const y = (h - padding) - yNorm * (h - padding * 2);
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }
        ctx.globalAlpha = 1.0;
    }
}
