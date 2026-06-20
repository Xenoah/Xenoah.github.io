/* 各レッスンで共通利用する描画ループ。非表示中の時間を進行量へ含めない。 */
export class LessonRuntime {
    constructor(updateCallback) {
        this.updateCallback = updateCallback;
        this.isRunning = true;
        this.startTime = performance.now();
        this.lastTime = this.startTime;
        this.totalPausedTime = 0;
        this.lastPauseStart = 0;
        this.time = 0;

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
                    // 復帰直後の経過時間を捨て、シミュレーションの跳ねを防ぐ。
                    this.lastTime = performance.now();
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

        // visibilitychange を取りこぼしても、1フレームの進行量が暴走しないよう上限を設ける。
        const safeDt = Math.min(dt, 0.1);

        this.time += safeDt;

        if (this.updateCallback) {
            this.updateCallback(this.time, safeDt);
        }
    }
}
