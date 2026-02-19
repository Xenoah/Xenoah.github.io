import { Globals } from './globals.js';

/**
 * ParameterManager
 * Handles UI generation from schema, event binding, and state management.
 */
export class ParameterManager {
    constructor(schema, containerId) {
        this.schema = schema;
        this.containerId = containerId; // Store ID to re-render
        this.container = document.getElementById(containerId);
        this.params = {};
        this.listeners = [];
        this.uiElements = {};

        // Initialize params with defaults
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

        // Preserve focus if re-rendering? 
        // Simpler to just rebuild for now, but focus loss might annoy if typing.
        // Given we deal with sliders/selects mainly, full rebuild is ok for language switch.

        this.container.innerHTML = '';
        this.uiElements = {}; // Reset ref

        // Group by 'folder'
        const groups = {};
        for (const key in this.schema) {
            const config = this.schema[key];
            const groupKey = config.folder || 'Main';
            // Simple localized group name helper?
            let groupName = groupKey;

            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(key);
        }

        for (const groupName in groups) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'control-group';

            if (groupName !== 'Main') {
                const title = document.createElement('h3');
                // Allow simple mapping for common folder names if we want, or Schema can provide localizations
                // For now, let's treat folder as a potential key if we want to localize it in Globals later
                title.textContent = groupName;
                title.style.fontSize = '0.9rem';
                title.style.marginBottom = '8px';
                groupDiv.appendChild(title);
            }

            groups[groupName].forEach(key => {
                const config = this.schema[key];

                // Determine Label
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
                    input.value = this.params[key]; // Use current value
                } else if (config.type === 'select') {
                    input = document.createElement('select');
                    config.options.forEach(opt => {
                        const option = document.createElement('option');
                        option.value = opt;
                        option.textContent = opt; // Could localize options too if they are keys
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

        // Update UI Display
        const storedVal = this.params[key];
        const display = document.getElementById(`val-${key}`);
        if (display) {
            display.textContent = this.formatValue(storedVal, this.schema[key]);
        }

        // Update Input if not triggered by input
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
        // renderUI will update inputs because we set defaults/overrides in params
        if (changed) this.notifyChange();
    }
}
