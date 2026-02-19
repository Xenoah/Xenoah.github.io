import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Schema
const SCHEMA = {
    mode: { label: 'Visual Mode', label_ja: '表示モード', type: 'select', options: ['Number Line', 'Blocks'], default: 'Number Line', folder: 'View' },
    op: { label: 'Operation', label_ja: '計算', type: 'select', options: ['Add (+)', 'Subtract (-)'], default: 'Add (+)', folder: 'Math' },
    a: { label: 'Number A', label_ja: '数 A', type: 'slider', min: -10, max: 10, step: 1, default: 2, folder: 'Math' },
    b: { label: 'Number B', label_ja: '数 B', type: 'slider', min: -10, max: 10, step: 1, default: 3, folder: 'Math' }
};

// 2. Setup
const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');
const runtime = new LessonRuntime(update);

const updateEq = () => {
    const p = paramsManager.getParams();
    const el = document.getElementById('eq-output');
    if (p.op === 'Add (+)') {
        el.textContent = `${p.a} + ${p.b} = ${p.a + p.b}`;
    } else {
        el.textContent = `${p.a} - ${p.b} = ${p.a - p.b}`;
    }
};

paramsManager.onChange(updateEq);
updateEq();

// UI Events
Globals.subscribe(state => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Arithmetic', ja: '算数' },
            'desc': { en: 'Visualizing Operations', ja: '計算の可視化' },
            'share': { en: 'Share', ja: '共有' },
            'equation': { en: 'Equation', ja: '式' },
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
    const cx = w/2;
    const cy = h/2;
    
    const result = (p.op === 'Add (+)') ? p.a + p.b : p.a - p.b;
    
    if (p.mode === 'Number Line') {
        const scale = 40;
        
        // Draw Line
        Render.drawLine(ctx, 0, cy, w, cy, 'white', 2);
        
        // Ticks
        const range = Math.ceil(w / scale / 2);
        for (let i = -range; i <= range; i++) {
            const x = cx + i * scale;
            Render.drawLine(ctx, x, cy - 5, x, cy + 5, 'white', 1);
            if (Math.abs(i) % 5 === 0) {
                 Render.drawText(ctx, i.toString(), x, cy + 25, 'white', '12px sans-serif');
            }
        }
        
        // Arrows
        // From 0 to A
        drawArrow(ctx, cx, cy - 20, cx + p.a * scale, cy - 20, Render.getThemeColor('--accent-primary'), `A=${p.a}`);
        
        // From A to Result (A+B)
        const startX = cx + p.a * scale;
        const endX = cx + result * scale;
        // If subtract, B is negative direction effectively? 
        // Logic: A - B is A + (-B).
        
        // If op is subtract, draw vector -B starting from A
        // If op is add, draw vector B starting from A
        
        const vecB = (p.op === 'Add (+)') ? p.b : -p.b;
        const labelB = (p.op === 'Add (+)') ? `+B=${p.b}` : `-B=${p.b}`;
        
        drawArrow(ctx, startX, cy - 40, endX, cy - 40, Render.getThemeColor('--accent-secondary'), labelB);
        
        // Result
        Render.drawCircle(ctx, cx + result * scale, cy, 5, 'yellow', true);
        Render.drawText(ctx, `Total=${result}`, cx + result * scale, cy - 60, 'yellow');
        
    } else {
        // Blocks
        // Stack A and B
        const blockSize = 40;
        const groundY = cy + 100;
        
        // Draw A blocks
        const colA = Render.getThemeColor('--accent-primary');
        const colB = Render.getThemeColor('--accent-secondary');
        const colNeg = 'rgba(255, 50, 50, 0.8)'; // Red for negative
        
        // Helper to draw block stack
        const drawStack = (count, xOffset, color, label) => {
            const absCount = Math.abs(count);
            const isNeg = count < 0;
            const effColor = isNeg ? colNeg : color;
            
            for (let i = 0; i < absCount; i++) {
                const x = cx + xOffset;
                const y = groundY - i * blockSize - blockSize;
                ctx.fillStyle = effColor;
                ctx.fillRect(x, y, blockSize - 2, blockSize - 2);
                ctx.strokeStyle = 'white';
                ctx.strokeRect(x, y, blockSize - 2, blockSize - 2);
                
                // Text inside
                if (isNeg) {
                    Render.drawText(ctx, '-1', x + blockSize/2, y + blockSize/2, 'white');
                } else {
                     Render.drawText(ctx, '1', x + blockSize/2, y + blockSize/2, 'black');
                }
            }
            // Label
            Render.drawText(ctx, `${label} (${count})`, cx + xOffset + blockSize/2, groundY + 20, color);
        };
        
        // A at -100
        drawStack(p.a, -150, colA, 'A');
        
        // B at 0
        drawStack(p.b, 0, colB, 'B');
        
        // Result at 150
        drawStack(result, 150, 'yellow', 'Result');
        
        // Ground
        Render.drawLine(ctx, cx - 200, groundY, cx + 250, groundY, 'white', 2);
    }
}

function drawArrow(ctx, x1, y1, x2, y2, color, label) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    
    // Line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Head
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLen = 10;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.fill();
    
    // Label
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    Render.drawText(ctx, label, midX, midY - 10, color);
    
    // Drop lines
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    // Vertical lines down to axis? 
    // Just a nice touch
    ctx.setLineDash([]);
}
