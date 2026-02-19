/**
 * Render Utilities for HTML5 Canvas
 */

export const Render = {
    // Helper to get CSS variable value
    getThemeColor(varName) {
        return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    },

    clear(ctx) {
        const color = this.getThemeColor('--canvas-bg');
        const { width, height } = ctx.canvas;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
    },

    setupCanvas(canvas) {
        const dpr = window.devicePixelRatio || 1;
        const parent = canvas.parentElement;
        const rect = parent.getBoundingClientRect();

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        ctx.logicalWidth = rect.width;
        ctx.logicalHeight = rect.height;

        return ctx;
    },

    toScreen(x, y, ctx, xRange, yRange) {
        const w = ctx.logicalWidth;
        const h = ctx.logicalHeight;

        const sx = ((x - xRange[0]) / (xRange[1] - xRange[0])) * w;
        const sy = h - ((y - yRange[0]) / (yRange[1] - yRange[0])) * h;

        return { x: sx, y: sy };
    },

    drawGrid(ctx, xRange, yRange, step = 1) {
        const gridColor = this.getThemeColor('--grid-line');
        const axisColor = this.getThemeColor('--grid-axis');

        ctx.save();
        ctx.lineWidth = 1;

        const w = ctx.logicalWidth;
        const h = ctx.logicalHeight;

        ctx.strokeStyle = gridColor;

        // Vertical lines
        for (let x = Math.ceil(xRange[0]); x <= Math.floor(xRange[1]); x += step) {
            const pos = this.toScreen(x, 0, ctx, xRange, yRange);
            ctx.beginPath();
            ctx.moveTo(pos.x, 0);
            ctx.lineTo(pos.x, h);
            ctx.stroke();
        }

        // Horizontal lines
        for (let y = Math.ceil(yRange[0]); y <= Math.floor(yRange[1]); y += step) {
            const pos = this.toScreen(0, y, ctx, xRange, yRange);
            ctx.beginPath();
            ctx.moveTo(0, pos.y);
            ctx.lineTo(w, pos.y);
            ctx.stroke();
        }

        // Axes
        ctx.lineWidth = 2;
        ctx.strokeStyle = axisColor;

        // Y Axis
        if (xRange[0] <= 0 && xRange[1] >= 0) {
            const origin = this.toScreen(0, 0, ctx, xRange, yRange);
            ctx.beginPath();
            ctx.moveTo(origin.x, 0);
            ctx.lineTo(origin.x, h);
            ctx.stroke();
        }

        // X Axis
        if (yRange[0] <= 0 && yRange[1] >= 0) {
            const origin = this.toScreen(0, 0, ctx, xRange, yRange);
            ctx.beginPath();
            ctx.moveTo(0, origin.y);
            ctx.lineTo(w, origin.y);
            ctx.stroke();
        }

        ctx.restore();
    },

    drawCircle(ctx, x, y, radius, color, fill = false) {
        if (!color) color = this.getThemeColor('--text-color'); // fallback
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);
        if (fill) {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            ctx.strokeStyle = color;
            ctx.stroke();
        }
    },

    drawLine(ctx, x1, y1, x2, y2, color, width = 1) {
        if (!color) color = this.getThemeColor('--text-color');
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
    },

    drawText(ctx, text, x, y, color, font) {
        if (!color) color = this.getThemeColor('--text-color');
        if (!font) font = '12px ' + this.getThemeColor('--font-mono');

        ctx.save();
        ctx.fillStyle = color;
        ctx.font = font;
        ctx.fillText(text, x, y);
        ctx.restore();
    }
};
