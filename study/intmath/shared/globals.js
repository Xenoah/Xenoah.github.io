/* 全レッスンで共有するテーマと言語の状態。サイドバーへ共通操作を後付けする。 */
export const Globals = {
    state: {
        theme: localStorage.getItem('math-theme') || 'dark',
        lang: localStorage.getItem('math-lang') || 'en'
    },

    listeners: [],

    init() {
        this.applyTheme();
        this.injectControls();
    },

    applyTheme() {
        document.documentElement.setAttribute('data-theme', this.state.theme);
    },

    injectControls() {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // 各レッスンのHTMLを重複修正せずに済むよう、共通操作を実行時に注入する。
        let container = document.getElementById('global-settings');
        if (!container) {
            container = document.createElement('div');
            container.id = 'global-settings';
            sidebar.appendChild(container);
        }

        container.innerHTML = `
            <button id="btn-theme" class="small-btn" title="Toggle Theme">
                ${this.state.theme === 'dark' ? '☀ Light' : '☾ Dark'}
            </button>
            <button id="btn-lang" class="small-btn" title="Switch Language">
                ${this.state.lang === 'en' ? '日本語' : 'English'}
            </button>
        `;

        document.getElementById('btn-theme').addEventListener('click', () => this.toggleTheme());
        document.getElementById('btn-lang').addEventListener('click', () => this.toggleLang());
    },

    toggleTheme() {
        this.state.theme = this.state.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('math-theme', this.state.theme);
        this.applyTheme();
        this.injectControls();
        this.notify();
    },

    toggleLang() {
        this.state.lang = this.state.lang === 'en' ? 'ja' : 'en';
        localStorage.setItem('math-lang', this.state.lang);
        this.injectControls();
        this.notify();
    },

    subscribe(cb) {
        this.listeners.push(cb);
        // 初回描画にも現在値を使わせるため、購読登録時に一度通知する。
        cb(this.state);
    },

    notify() {
        this.listeners.forEach(cb => cb(this.state));
    },

    // 辞書キー未登録のレッスンでも、英日テキストの直接指定で段階的に対応できる。
    getText(key, en, ja) {
        if (this.state.lang === 'ja' && ja) return ja;
        return en || key;
    }
};

Globals.init();
