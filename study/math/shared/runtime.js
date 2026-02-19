/**
 * LessonRuntime
 * Manages the animation loop, time delta, and visibility.
 */
export class LessonRuntime {
    constructor(updateCallback) {
        this.updateCallback = updateCallback;
        this.isRunning = true;
        this.startTime = performance.now();
        this.lastTime = this.startTime;
        this.totalPausedTime = 0;
        this.lastPauseStart = 0;
        this.time = 0; // Simulation time in seconds

        // Controls
        this.controls = {
            playPause: null,
            reset: null
        };

        this.initVisibilityHandler();
        this.loop = this.loop.bind(this);
        requestAnimationFrame(this.loop);
    }

    bindControls(playPauseBtnId, resetBtnId) {
        this.controls.playPause = document.getElementById(playPauseBtnId);
        this.controls.reset = document.getElementById(resetBtnId);

        if (this.controls.playPause) {
            this.controls.playPause.addEventListener('click', () => this.togglePause());
        }
        if (this.controls.reset) {
            this.controls.reset.addEventListener('click', () => this.resetTime());
        }
    }

    togglePause() {
        this.isRunning = !this.isRunning;
        if (this.controls.playPause) {
            this.controls.playPause.textContent = this.isRunning ? 'Pause' : 'Play';
            this.controls.playPause.classList.toggle('active', this.isRunning);
        }
    }

    resetTime() {
        this.time = 0;
        this.startTime = performance.now();
        this.lastTime = this.startTime;
        // Optionally callback for immediate render
        this.updateCallback(0, 0);
    }

    initVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.wasRunningBeforeHidden = this.isRunning;
                this.isRunning = false;
            } else {
                if (this.wasRunningBeforeHidden) {
                    this.isRunning = true;
                    this.lastTime = performance.now(); // Reset lastTime to avoid huge dt jump
                }
            }
        });
    }

    loop(now) {
        requestAnimationFrame(this.loop);

        if (!this.isRunning) {
            this.lastTime = now;
            return;
        }

        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;

        // Cap dt to prevent huge jumps if tab was inactive but visibility loop didn't catch it
        const safeDt = Math.min(dt, 0.1);

        this.time += safeDt;

        if (this.updateCallback) {
            this.updateCallback(this.time, safeDt);
        }
    }
}
