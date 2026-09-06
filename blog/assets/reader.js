/* Keep the legacy menu frames and shareable blog URLs in sync. */
(function () {
  "use strict";
  const script = document.currentScript;
  if (!script?.src) return;
  const site = new URL("../../", script.src), blog = new URL("../", script.src).pathname;
  function blogUrl(value) {
    try {
      const url = new URL(value, site);
      if (url.origin !== site.origin || !url.pathname.startsWith(blog)) return null;
      const path = url.pathname.slice(blog.length);
      if (path !== "" && path !== "editor.html" && !/^\d{4}\/\d{2}\/\d{2}\/[^/]+\/$/.test(path)) return null;
      if (url.searchParams.get("view") === "menu") url.searchParams.delete("view");
      return url;
    } catch { return null; }
  }
  const frameset = document.querySelector("frameset"), right = frameset?.querySelector('frame[name="right"]');
  if (window === window.top && right) {
    const initialTitle = document.title;
    function sync() {
      try {
        const current = right.contentWindow.location;
        if (current.origin !== site.origin) return;
        const article = blogUrl(current.href), visible = article ? new URL(article) : new URL(site);
        if (article) visible.searchParams.set("view", "menu");
        // Frame navigation already creates a browser history entry. Replacing its
        // address avoids duplicate entries and keeps Back/Forward tied to the frame.
        if (location.href !== visible.href) history.replaceState(null, "", visible);
        document.title = right.contentDocument.title || initialTitle;
        const canonical = document.querySelector('link[rel="canonical"]');
        if (canonical) canonical.href = article?.href.split("?")[0].split("#")[0] || site.href;
      } catch { /* The menu also has external destinations; leave them independent. */ }
    }
    window.BlogFrameNavigation = { sync };
    right.addEventListener("load", sync);
    window.addEventListener("message", (event) => {
      if (event.origin === site.origin && event.source === right.contentWindow && event.data === "blog-route-change") sync();
    });
    // Absolute frame sources continue to work after the parent's address changes.
    const left = frameset.querySelector('frame[name="left"]');
    if (left) left.src = new URL("menu.htm", site).href;
    const requested = new URL(location.href).searchParams.get("blog");
    right.src = blogUrl(requested || "")?.href || new URL("top.htm", site).href;
    return;
  }
  const article = blogUrl(location.href);
  if (!article) return;
  let framed = false;
  try { framed = window.parent !== window && window.parent.document.querySelector('frameset frame[name="right"]')?.contentWindow === window; } catch { /* Standalone in other sites' embeds. */ }
  if (window === window.top && new URL(location.href).searchParams.get("view") === "menu") {
    const entry = new URL(site); entry.searchParams.set("blog", article.pathname + article.search + article.hash);
    location.replace(entry.href);
    return;
  }
  const nav = document.querySelector(".blog-nav");
  if (nav) {
    const toggle = document.createElement("a"); toggle.dataset.blogView = "";
    toggle.textContent = framed ? "単独で開く" : "サイトメニュー";
    toggle.target = "_top";
    function updateToggle() {
      const url = blogUrl(location.href);
      if (!url) return;
      if (!framed) url.searchParams.set("view", "menu");
      toggle.href = url.href;
    }
    updateToggle(); nav.append(toggle);
    window.addEventListener("hashchange", updateToggle);
    window.addEventListener("popstate", updateToggle);
    document.addEventListener("blog-route-change", updateToggle);
  }
  if (framed) {
    const notify = () => window.parent.postMessage("blog-route-change", site.origin);
    window.addEventListener("hashchange", notify);
    window.addEventListener("popstate", notify);
    window.addEventListener("pageshow", notify);
    document.addEventListener("blog-route-change", notify);
    notify();
  }
})();

(function () {
  "use strict";
  const filters = document.getElementById("articleFilters");
  if (filters) {
    const search = document.getElementById("articleSearch"), tag = document.getElementById("articleTag");
    const status = document.getElementById("searchStatus");
    const normalize = (text) => text.normalize("NFKC").toLocaleLowerCase();
    const entries = [...document.querySelectorAll("#articleList .post-card")].map((node) => {
      let tags;
      try { tags = JSON.parse(node.dataset.tags); } catch { tags = []; }
      return { node, text: normalize(node.dataset.search || node.textContent), tags: Array.isArray(tags) ? tags : [] };
    });
    for (const value of [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b, "ja"))) {
      tag.add(new Option(value, value));
    }
    function restoreQuery() {
      const query = new URLSearchParams(location.search);
      search.value = query.get("q") || "";
      const value = query.get("tag") || "";
      if (value && ![...tag.options].some((option) => option.value === value)) tag.add(new Option(value, value));
      tag.value = value;
    }
    function filter(updateUrl = true) {
      const terms = normalize(search.value).split(/\s+/).filter(Boolean);
      let count = 0;
      for (const entry of entries) {
        const show = terms.every((term) => entry.text.includes(term)) && (!tag.value || entry.tags.includes(tag.value));
        entry.node.hidden = !show; if (show) count++;
      }
      status.textContent = count ? `${count}件の記事 / 全${entries.length}件` : "該当する記事がありません。キーワードやタグを変えてみてください。";
      if (updateUrl) {
        const url = new URL(location.href);
        for (const [key, value] of [["q", search.value], ["tag", tag.value]]) {
          if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
        }
        history.replaceState(null, "", url);
        document.dispatchEvent(new Event("blog-route-change"));
      }
    }
    filters.hidden = false; status.hidden = false; restoreQuery(); filter(false);
    filters.addEventListener("submit", (event) => { event.preventDefault(); filter(); });
    search.addEventListener("input", () => filter()); tag.addEventListener("change", () => filter());
    filters.addEventListener("reset", (event) => { event.preventDefault(); search.value = ""; tag.value = ""; filter(); search.focus(); });
    window.addEventListener("popstate", () => { restoreQuery(); filter(false); });
  }
  const article = document.querySelector(".article-wrap .article-body");
  if (article) {
    const headings = [...article.querySelectorAll("h2,h3")].filter((heading) => heading.textContent.trim());
    if (headings.length < 2) return;
    const toc = document.createElement("details"); toc.className = "article-toc"; toc.open = true;
    const summary = document.createElement("summary"); summary.textContent = "この記事の目次";
    const nav = document.createElement("nav"); nav.setAttribute("aria-label", "記事の目次");
    const list = document.createElement("ol");
    headings.forEach((heading, index) => {
      let id = heading.id || "section-" + (index + 1);
      while (document.getElementById(id) && document.getElementById(id) !== heading) id += "-heading";
      heading.id = id;
      const item = document.createElement("li"), link = document.createElement("a");
      if (heading.localName === "h3") item.className = "subheading";
      link.href = "#" + encodeURIComponent(id); link.textContent = heading.textContent;
      item.append(link); list.append(item);
    });
    nav.append(list); toc.append(summary, nav); article.before(toc);
  }
})();
