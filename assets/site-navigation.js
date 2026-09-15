(function () {
  "use strict";
  // Keep old entry URLs usable after removing frames. Only known local routes may redirect.
  const current = new URL(location.href);
  const requested = current.searchParams.get("blog");
  if (requested && (location.pathname === "/" || location.pathname === "/index.html")) {
    try {
      const destination = new URL(requested, location.origin);
      if (destination.origin === location.origin && /^\/blog\/(?:|editor\.html|\d{4}\/\d{2}\/\d{2}\/[a-z0-9]+(?:-[a-z0-9]+)*\/)$/.test(destination.pathname)) {
        destination.searchParams.delete("view"); location.replace(destination.href); return;
      }
    } catch { /* Invalid old links leave the home page usable. */ }
  }
  if (current.searchParams.get("view") === "menu") {
    current.searchParams.delete("view"); history.replaceState(null, "", current);
  }
  // A permanently focusable ancestor can take focus away from WebKit editor controls.
  // Make the skip destination focusable only while the skip link is being used.
  document.querySelector(".skip-link")?.addEventListener("click", () => {
    const content = document.getElementById("main-content");
    if (!content) return;
    const previous = content.getAttribute("tabindex");
    content.setAttribute("tabindex", "-1"); content.focus({ preventScroll: true });
    if (previous === null) content.addEventListener("blur", () => content.removeAttribute("tabindex"), { once: true });
  });
  const menu = document.getElementById("site-navigation");
  if (menu) {
    const mobile = matchMedia("(max-width: 800px)");
    const resize = () => { menu.open = !mobile.matches; };
    resize(); mobile.addEventListener("change", resize);
    menu.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && mobile.matches && menu.open) { menu.open = false; menu.querySelector("summary").focus(); }
    });
    for (const link of menu.querySelectorAll(".menu-main a")) {
      if (new URL(link.href).pathname === location.pathname) link.setAttribute("aria-current", "page");
    }
  }
})();
