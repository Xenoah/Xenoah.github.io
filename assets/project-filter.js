(function () {
  "use strict";
  document.querySelectorAll("[data-project-filters]").forEach((form) => {
    const scope = form.closest(".site-menu") || form.parentElement;
    const entries = [...scope.querySelectorAll("[data-project]")];
    const search = form.elements.q, category = form.elements.category;
    const status = form.querySelector("[data-project-status]");
    const normalize = (value) => value.normalize("NFKC").toLocaleLowerCase("ja");
    const syncUrl = !form.closest(".site-menu");
    function restore() {
      if (!syncUrl) return;
      const params = new URLSearchParams(location.search);
      search.value = params.get("q") || ""; category.value = params.get("category") || "";
    }
    function filter(updateUrl = true) {
      const words = normalize(search.value).split(/\s+/).filter(Boolean);
      let visible = 0;
      entries.forEach((node) => {
        node.hidden = !words.every(word => normalize(node.textContent).includes(word)) || !!category.value && node.dataset.category !== category.value;
        if (!node.hidden) visible++;
      });
      scope.querySelectorAll("[data-project-section]").forEach(section => { section.hidden = ![...section.querySelectorAll("[data-project]")].some(node => !node.hidden); });
      status.textContent = visible ? `${visible}件 / 全${entries.length}件` : "該当する作品がありません。検索条件を変えてください。";
      if (syncUrl && updateUrl) {
        const url = new URL(location.href);
        for (const [key, value] of [["q", search.value], ["category", category.value]]) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
        history.replaceState(null, "", url);
      }
    }
    form.hidden = false; restore(); filter(false);
    form.addEventListener("submit", (event) => { event.preventDefault(); filter(); });
    search.addEventListener("input", () => filter()); category.addEventListener("change", () => filter());
    form.addEventListener("reset", (event) => { event.preventDefault(); search.value = ""; category.value = ""; filter(); search.focus(); });
    window.addEventListener("popstate", () => { restore(); filter(false); });
  });
})();
