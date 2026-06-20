import { Globals } from './globals.js';

/* レッスン固有のSCHEMAから操作UIと現在値を生成する。
 * URLクエリへの直列化もここで統一し、共有リンクから同じ条件を復元する。 */
export class ParameterManager {
    constructor(schema, containerId) {
        this.schema = schema;
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.params = {};
        this.listeners = [];
        this.uiElements = {};

        // URL読込前の基準値として、SCHEMAのdefaultをすべて展開する。
        for (const [key, config] of Object.entries(schema)) {
            this.params[key] = config.default;
        }

        Globals.subscribe(state => {
            this.renderUI(state.lang);
        });

        this.deserializeFromUrl();
    }

    renderUI(lang) {
        if (!this.container) {
            this.container = document.getElementById(this.containerId);
            if (!this.container) return;
        }

        // 言語切替時はラベルも変わるため全体を再生成する。入力途中のフォーカスは維持しない。

        this.container.innerHTML = '';
        this.uiElements = {};

        // folder名ごとにまとめ、レッスン側のSCHEMA順を保って表示する。
        const groups = {};
        for (const key in this.schema) {
            const config = this.schema[key];
            const groupKey = config.folder || 'Main';
            let groupName = groupKey;

            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(key);
        }

        for (const groupName in groups) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'control-group';

            if (groupName !== 'Main') {
                const title = document.createElement('h3');
                // folder名は現状SCHEMAの文字列をそのまま表示する。
                title.textContent = groupName;
                title.style.fontSize = '0.9rem';
                title.style.marginBottom = '8px';
                groupDiv.appendChild(title);
            }

            groups[groupName].forEach(key => {
                const config = this.schema[key];

                // 日本語ラベルがない項目は英語ラベルへフォールバックする。
                const labelText = (lang === 'ja' && config.label_ja) ? config.label_ja : config.label;

                const wrapper = document.createElement('div');
                wrapper.innerHTML = `
                    <label>
                        ${labelText || key}
                        <span class="value-display" id="val-${key}">${this.formatValue(this.params[key], config)}</span>
                    </label>
                `;

                let input;
                if (config.type === 'number' || config.type === 'slider') {
                    input = document.createElement('input');
                    input.type = 'range';
                    input.min = config.min;
                    input.max = config.max;
                    input.step = config.step;
                    input.value = this.params[key];
                } else if (config.type === 'select') {
                    input = document.createElement('select');
                    config.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt;
                        option.selected = opt === this.params[key];
                        input.appendChild(option);
                    });
                } else if (config.type === 'checkbox' || config.type === 'toggle') {
                    input = document.createElement('input');
                    input.type = 'checkbox';
                    input.checked = this.params[key];
                }

                input.id = `input-${key}`;
                input.addEventListener('input', (e) => {
                    let val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
                    if (config.type === 'number' || config.type === 'slider') {
                        val = parseFloat(val);
                    }
                    this.updateParam(key, val);
                });

                wrapper.appendChild(input);
                groupDiv.appendChild(wrapper);
                this.uiElements[key] = input;
            });

            this.container.appendChild(groupDiv);
        }
    }

    formatValue(val, config) {
        if (typeof val === 'number') {
            return val.toFixed(config.precision || 2);
        }
        return val;
    }

    updateParam(key, value, internal = false) {
        this.params[key] = value;

        // 表示値と内部値を同じformatValue規則で揃える。
        const storedVal = this.params[key];
        const display = document.getElementById(`val-${key}`);
        if (display) {
            display.textContent = this.formatValue(storedVal, this.schema[key]);
        }

        // プリセットなど内部更新の場合だけ、入力要素側へ値を書き戻す。
        if (internal && this.uiElements[key]) {
            if (this.uiElements[key].type === 'checkbox') {
                this.uiElements[key].checked = storedVal;
            } else {
                this.uiElements[key].value = storedVal;
            }
        }

        this.notifyChange();
    }

    notifyChange() {
        this.listeners.forEach(cb => cb(this.params));
    }

    onChange(callback) {
        this.listeners.push(callback);
    }

    getParams() {
        return { ...this.params };
    }

    serializeToUrl() {
        // 全パラメーターをURLへ含め、レッスン状態を単独リンクで再現できるようにする。
        const params = new URLSearchParams();
        for (const key in this.params) {
            params.set(key, this.params[key]);
        }
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
        return newUrl;
    }

    deserializeFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        let changed = false;

        for (const key in this.schema) {
            if (urlParams.has(key)) {
                let val = urlParams.get(key);
                const config = this.schema[key];

                if (config.type === 'number' || config.type === 'slider') {
                    val = parseFloat(val);
                } else if (config.type === 'checkbox' || config.type === 'toggle') {
                    val = (val === 'true');
                }

                this.params[key] = val;
                changed = true;
            }
        }
        // UI生成前にparamsへ反映しておけば、初回renderUIで入力値も揃う。
        if (changed) this.notifyChange();
    }
}
