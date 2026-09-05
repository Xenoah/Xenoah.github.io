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
