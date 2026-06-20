(function () {
    // Three.jsなどのCDN読込失敗も拾えるよう、通常の例外とは別にリソースエラーを監視する。
    function showFailure(message, detail) {
        const el = document.getElementById('loading-screen');
        if (!el) return;
        const safeMessage = String(message || 'Unknown error');
        const safeDetail = detail ? String(detail) : '';
        el.style.background = '#110000';
        el.innerHTML = `<div style="color:#ff5555; text-align:center; padding:20px; max-width:900px; margin:0 auto; font-family:monospace;">
            <h2 style="font-size:24px; margin-bottom:10px;">SYSTEM FAILURE</h2>
            <p style="font-size:18px; margin-bottom:8px;">${safeMessage}</p>
            ${safeDetail ? `<p style="color:#fca5a5; font-size:12px; white-space:pre-wrap; word-break:break-word; margin-top:8px;">${safeDetail}</p>` : ''}
            <p style="color:#888; font-size:12px; margin-top:12px;">If running locally, ensure you have internet access for CDN libraries.</p>
        </div>`;
    }

    window.onerror = function (msg, url, line, column, error) {
        const location = [url, line, column].filter(v => v !== undefined && v !== null && v !== '').join(':');
        const detail = error?.stack || location || '';
        showFailure(msg, detail);
        return false;
    };

    window.addEventListener('error', function (event) {
        const target = event.target;
        if (!target || target === window) return;
        const tag = target.tagName || 'RESOURCE';
        const source = target.src || target.href || '[inline resource]';
        showFailure(`${tag} LOAD FAILURE`, source);
    }, true);

    window.addEventListener('unhandledrejection', function (event) {
        const reason = event.reason;
        const message = reason?.message || reason || 'Unhandled promise rejection';
        const detail = reason?.stack || '';
        showFailure(message, detail);
    });
})();
