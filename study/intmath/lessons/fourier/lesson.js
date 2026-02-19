import { ParameterManager } from '../../shared/params.js';
import { LessonRuntime } from '../../shared/runtime.js';
import { Render } from '../../shared/render.js';
import { Globals } from '../../shared/globals.js';

// 1. Schema
const SCHEMA = {
    wave: { label: 'Waveform', label_ja: '波形', type: 'select', options: ['Sine', 'Square', 'Sawtooth', 'Noise', 'Mix'], default: 'Square', folder: 'Signal' },
    freq: { label: 'Frequency (Hz)', label_ja: '周波数 (Hz)', type: 'slider', min: 1, max: 20, step: 1, default: 3, folder: 'Signal' },
    harmonics: { label: 'Harmonics (Generation)', label_ja: '高調波 (生成用)', type: 'slider', min: 1, max: 50, step: 1, default: 10, folder: 'Signal' },

    samples: { label: 'Samples (N)', label_ja: 'サンプル数 (N)', type: 'slider', min: 32, max: 512, step: 32, default: 128, folder: 'Analysis' },
    showPhase: { label: 'Show Phase', label_ja: '位相を表示', type: 'toggle', default: false, folder: 'View' }
};

// 2. Setup
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
            'title': { en: 'Fourier Transform', ja: 'フーリエ変換' },
            'share': { en: 'Share', ja: '共有' }
        };
        if (dict[key]) el.textContent = Globals.getText(key, dict[key].en, dict[key].ja);
    });

    document.getElementById('btn-share').textContent = Globals.getText('Share', 'Share', '共有');
});

// 3. Logic: DFT Implementation
function DFT(signal) {
    const N = signal.length;
    const X = [];
    for (let k = 0; k < N / 2; k++) {
        let re = 0;
        let im = 0;
        for (let n = 0; n < N; n++) {
            const phi = (2 * Math.PI * k * n) / N;
            re += signal[n] * Math.cos(phi);
            im -= signal[n] * Math.sin(phi);
        }
        re /= N;
        im /= N;
        if (k > 0) { re *= 2; im *= 2; }

        const amp = Math.sqrt(re * re + im * im);
        const phase = Math.atan2(im, re);
        X.push({ freq: k, amp, phase });
    }
    return X;
}

function generateSignal(type, freq, harmonics, N) {
    const data = [];
    for (let i = 0; i < N; i++) {
        const t = i / N;
        let val = 0;

        if (type === 'Sine') {
            val = Math.sin(2 * Math.PI * freq * t);
        } else if (type === 'Square') {
            for (let h = 1; h <= harmonics; h += 2) {
                val += (1 / h) * Math.sin(2 * Math.PI * (freq * h) * t);
            }
            val *= 4 / Math.PI;
        } else if (type === 'Sawtooth') {
            for (let h = 1; h <= harmonics; h++) {
                val += (1 / h) * Math.sin(2 * Math.PI * (freq * h) * t);
            }
            val *= 2 / Math.PI * -1;
        } else if (type === 'Noise') {
            val = (Math.random() - 0.5) * 2;
        } else if (type === 'Mix') {
            val = Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * (freq * 2.5) * t);
        }
        data.push(val);
    }
    return data;
}

// 4. Update
function update(time, dt) {
    const p = paramsManager.getParams();
    Render.clear(ctx);

    const w = ctx.logicalWidth;
    const h = ctx.logicalHeight;

    const pad = 40;
    const regionH = (h - pad * 3) / 2;

    const colGrid = Render.getThemeColor('--grid-line');
    const colAxis = Render.getThemeColor('--text-muted');
    const colSignal = Render.getThemeColor('--accent-primary');
    const colFreq = Render.getThemeColor('--accent-secondary');

    const signal = generateSignal(p.wave, p.freq, p.harmonics, p.samples);

    ctx.strokeStyle = colGrid;
    ctx.strokeRect(pad, pad, w - pad * 2, regionH);

    // Plot Time
    ctx.beginPath();
    ctx.strokeStyle = colSignal;
    ctx.lineWidth = 2;

    for (let i = 0; i < signal.length; i++) {
        const x = pad + (i / (signal.length - 1)) * (w - pad * 2);
        const y = pad + regionH / 2 - signal[i] * (regionH / 2 * 0.8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    Render.drawText(ctx, Globals.getText('Time Domain', 'Time Domain', '時間領域'), pad, pad - 10, colAxis);

    const spectrum = DFT(signal);

    // Draw Freq
    const top2 = pad * 2 + regionH;
    ctx.strokeStyle = colGrid;
    ctx.strokeRect(pad, top2, w - pad * 2, regionH);

    Render.drawText(ctx, Globals.getText('Frequency Domain', 'Frequency Domain', '周波数領域'), pad, top2 - 10, colAxis);

    const maxFreq = 30;
    const barW = (w - pad * 2) / maxFreq;

    ctx.fillStyle = colFreq;
    for (let k = 0; k < Math.min(spectrum.length, maxFreq); k++) {
        const bin = spectrum[k];
        const hBar = bin.amp * (regionH * 0.8);
        const x = pad + k * barW;
        const y = top2 + regionH;

        ctx.fillRect(x + 2, y - hBar, barW - 4, hBar);

        if (bin.amp > 0.1) {
            Render.drawText(ctx, k.toString(), x + barW / 2 - 3, y + 15, colAxis, '10px monospace');
        }
    }
}
