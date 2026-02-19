/**
 * Globals Manager
 * Handles Theme (Light/Dark) and Language (EN/JA) state.
 * Injects toggle controls into the sidebar.
 */
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

        // Check if exists
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
        this.injectControls(); // Update button text
        this.notify();
    },

    toggleLang() {
        this.state.lang = this.state.lang === 'en' ? 'ja' : 'en';
        localStorage.setItem('math-lang', this.state.lang);
        this.injectControls(); // Update button text
        this.notify();
    },

    subscribe(cb) {
        this.listeners.push(cb);
        // Immediate callback
        cb(this.state);
    },

    notify() {
        this.listeners.forEach(cb => cb(this.state));
    },

    // Helper to get text based on current lang
    // usage: t('Play') -> looks up simple dictionary or returns key
    // usage: t('key', 'En Text', 'Ja Text') -> direct provision
    getText(key, en, ja) {
        if (this.state.lang === 'ja' && ja) return ja;
        return en || key;
    }
};

Globals.init();
