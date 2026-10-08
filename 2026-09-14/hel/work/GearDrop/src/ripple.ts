// A soft ripple from wherever a button is clicked. One listener for the whole
// page, so no button needs changing. Skipped when reduced motion is preferred.
export function installRipple(doc: Document = document) {
  doc.addEventListener("pointerdown", e => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = (e.target as Element | null)?.closest<HTMLElement>("button:not(:disabled), .cta");
    if (!el || el.closest(".nyx-face")) return;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const r = el.getBoundingClientRect();
    const host = doc.createElement("span"); host.className = "ripple-host"; host.setAttribute("aria-hidden", "true");
    const dot = doc.createElement("span"); dot.className = "ripple";
    dot.style.left = `${e.clientX - r.left}px`; dot.style.top = `${e.clientY - r.top}px`;
    host.append(dot); el.append(host);
    setTimeout(() => host.remove(), 600);
  });
}
