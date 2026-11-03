(() => {
  "use strict";
  const root = document.querySelector("[data-notices]");
  if (!root || root.dataset.noticesReady) return;
  root.dataset.noticesReady = "true";
  const list = root.querySelector(".notices-list"), track = root.querySelector(".notices-track");
  const button = root.querySelector("[data-notices-toggle]"), help = root.querySelector("[data-notices-help]");
  if (!list || !track || !button || list.children.length < 2) return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let paused = false, copy;
  function setSpeed() {
    const width = list.getBoundingClientRect().width;
    if (width > 0) root.style.setProperty("--notices-duration", `${width / 180}s`);
  }
  function update() {
    const running = !paused && !motion.matches;
    if (copy) { copy.remove(); copy = null; }
    if (running) {
      copy = list.cloneNode(true);
      copy.dataset.noticesCopy = "true";
      copy.setAttribute("aria-hidden", "true");
      copy.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
      copy.querySelectorAll("a, button, input, [tabindex]").forEach(node => node.setAttribute("tabindex", "-1"));
      track.append(copy);
    }
    root.classList.toggle("notices-running", running);
    setSpeed();
    button.hidden = motion.matches;
    if (help) help.hidden = !running;
    button.setAttribute("aria-pressed", String(paused));
    button.textContent = paused ? "スクロールを再開" : "停止してすべて読む";
  }
  button.addEventListener("click", () => { paused = !paused; update(); });
  motion.addEventListener("change", update);
  if (window.ResizeObserver) new ResizeObserver(setSpeed).observe(list);
  update();
})();
