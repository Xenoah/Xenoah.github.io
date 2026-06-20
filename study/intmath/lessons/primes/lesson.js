/* エラトステネスの篩結果を数表とウラム螺旋の2形式で描画する。 */
import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

const SCHEMA = {
    mode: { label: 'Mode', label_ja: 'モード', type: 'select', options: ['Sieve (Grid)', 'Ulam Spiral'], default: 'Sieve (Grid)', folder: 'View' },
    max: { label: 'Max Number', label_ja: '最大数', type: 'slider', min: 10, max: 2000, step: 10, default: 100, folder: 'Range' },
};

const canvas = document.getElementById('main-canvas');
const ctx = Render.setupCanvas(canvas);
const paramsManager = new ParameterManager(SCHEMA, 'controls-container');

let primes = [];
let isPrime = [];

const calculatePrimes = () => {
    const p = paramsManager.getParams();
    const max = p.max;
    // エラトステネスの篩。i²未満の倍数は既に除外済みなのでi²から開始する。
    isPrime = new Uint8Array(max + 1).fill(1);
    isPrime[0] = 0;
    isPrime[1] = 0;
    primes = [];
    
    for (let i = 2; i <= Math.sqrt(max); i++) {
        if (isPrime[i]) {
            for (let j = i * i; j <= max; j += i) isPrime[j] = 0;
        }
    }
    
    for (let i = 0; i <= max; i++) {
        if (isPrime[i]) primes.push(i);
    }
    
    document.getElementById('info-output').innerHTML = 
        `${Globals.getText('Primes found', 'Primes found', '素数の数')}: ${primes.length}<br>` + 
        `${Globals.getText('Density', 'Density', '密度')}: ${(primes.length/max*100).toFixed(1)}%`;
};

paramsManager.onChange(() => {
    calculatePrimes(); 
    requestRender();
});

calculatePrimes();

const runtime = new LessonRuntime(update);

function requestRender() {
    update();
}

Globals.subscribe(state => {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const dict = {
            'back': { en: '← Back to Menu', ja: '← メニューに戻る' },
            'title': { en: 'Prime Numbers', ja: '素数' },
            'desc': { en: 'Patterns in numbers', ja: '数のパターン' },
            'share': { en: 'Share', ja: '共有' },
            'info': { en: 'Statistics', ja: '統計' },
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });
    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');
    calculatePrimes();
    update();
});

document.getElementById('btn-share').addEventListener('click', () => {
    const url = paramsManager.serializeToUrl();
    navigator.clipboard.writeText(url).then(() => alert(Globals.getText('Link copied!', 'Link copied!', 'リンクをコピーしました！')));
});
window.addEventListener('resize', () => { Render.setupCanvas(canvas); update(); });

function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);
    
    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;
    const cx = w/2;
    const cy = h/2;
    
    if (p.mode === 'Sieve (Grid)') {
        const count = p.max;
        const cols = Math.ceil(Math.sqrt(count * (w/h)));
        // 数表としての読みやすさを優先し、列数は10で固定する。
        const COLS = 10;
        const cellSize = Math.min((w - 40) / COLS, (h - 40) / Math.ceil(count/COLS));
        const startX = (w - COLS * cellSize) / 2;
        const startY = 20;
        
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.floor(cellSize * 0.4)}px monospace`;
        
        for (let i = 1; i <= count; i++) {
            const idx = i - 1;
            const r = Math.floor(idx / COLS);
            const c = idx % COLS;
            
            const x = startX + c * cellSize;
            const y = startY + r * cellSize;
            
            // 素数だけをアクセント色で強調する。
            if (isPrime[i]) {
                 ctx.fillStyle = Render.getThemeColor('--accent-primary');
            } else {
                 ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            }
            
            ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
            
            ctx.fillStyle = isPrime[i] ? 'black' : 'rgba(255,255,255,0.5)';
            ctx.fillText(i, x + cellSize/2, y + cellSize/2);
        }
    } else {
        // 1を中心に置き、右・上・左・下の順で歩幅を2回ごとに増やす。
        const count = p.max;
        // おおよそ√N四方へ収まる前提でセル寸法を決める。
        const dim = Math.ceil(Math.sqrt(count));
        const cellSize = Math.min(w, h) / (dim + 2);
        
        let x = cx;
        let y = cy;
        let dx = 1;
        let dy = 0;
        let step = 1;
        let stepCount = 0;
        let turnCounter = 0;
        
        ctx.fillStyle = Render.getThemeColor('--accent-primary');

        let curr = 1;
        let currentStep = 1;
        let stepsTaken = 0;
        let turnCount = 0;

        // CanvasはY下向きなので、上方向だけdy=-1になる。
        const dirs = [{x:1, y:0}, {x:0, y:-1}, {x:-1, y:0}, {x:0, y:1}];
        let dirIdx = 0;
        
        while (curr <= count) {
            if (isPrime[curr]) {
                ctx.fillRect(x - cellSize/2, y - cellSize/2, cellSize-1, cellSize-1);
            } else {
                // 合成数は描かず、素数が作る斜線パターンを見やすくする。
            }
            
            // Move
            x += dirs[dirIdx].x * cellSize;
            y += dirs[dirIdx].y * cellSize;
            
            curr++;
            stepsTaken++;
            
            if (stepsTaken === currentStep) {
                stepsTaken = 0;
                dirIdx = (dirIdx + 1) % 4;
                turnCount++;
                if (turnCount % 2 === 0) {
                    currentStep++;
                }
            }
        }
    }
}
