/* i18n/index.js — JSON 辞書を fetch でロードしてキー→文字列を解決する。 */

const dictionaries = new Map(); // locale -> dict
let current = 'ja';

export async function loadLocale(locale) {
  if (dictionaries.has(locale)) {
    current = locale;
    apply();
    return;
  }
  try {
    const res = await fetch(new URL(`./${locale}.json`, import.meta.url));
    if (!res.ok) throw new Error(`failed to load locale ${locale}`);
    const dict = await res.json();
    dictionaries.set(locale, dict);
    current = locale;
    apply();
  } catch (err) {
    console.warn('[i18n] load failed', err);
  }
}

export function t(key) {
  const dict = dictionaries.get(current);
  return dict?.[key] ?? key;
}

/** Re-apply translations to elements with data-i18n[-title]. */
export function apply() {
  document.documentElement.lang = current;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    if (key) el.setAttribute('title', t(key));
  });
}

export function getLocale() {
  return current;
}
