// Homepage sections stack like cards: each one tips forward flat as it
// arrives, pins once you reach its bottom, and the next slides over it while
// it shrinks, dims and blurs slightly. Tablets/desktops only; off for reduced motion.
const NAV = 76; // sticky top bar height
const clamp = (n: number) => Math.min(1, Math.max(0, n));

// Pure maths for one section (unit-tested). `top` is its on-screen top,
// `height` its height, `nextTop` the next section's top (null if last).
export function stackState(top: number, height: number, nextTop: number | null, vh: number) {
  const stick = Math.min(NAV, vh - height); // pin when the bottom is reached
  return {
    stick,
    // how far the next card has slid over, counted from the moment this one pins
    cover: nextTop === null ? 0 : +clamp((stick + height - nextTop) / height).toFixed(3),
    tilt: +((1 - clamp((vh - top) / (vh * .7))) * 7).toFixed(2), // degrees still tipped back
  };
}

// Pinned sections confuse the browser's own jump-to-anchor, so jump to where
// the section really starts in the page (sum of the sections above it).
export function scrollToSection(target: Element | null) {
  const el = target?.closest<HTMLElement>("main > .stack");
  if (!el || !matchMedia("(min-width: 700px) and (prefers-reduced-motion: no-preference)").matches) { target?.scrollIntoView({ behavior: "smooth" }); return; }
  let top = el.parentElement!.getBoundingClientRect().top + scrollY;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) top += (s as HTMLElement).offsetHeight;
  scrollTo({ top: el === el.parentElement!.firstElementChild ? 0 : top - NAV, behavior: "smooth" });
}

export function installStack() {
  document.addEventListener("click", e => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    const target = a && a.getAttribute("href")!.length > 1 ? document.querySelector(a.getAttribute("href")!) : null;
    if (!target?.closest("main > .stack")) return;
    e.preventDefault(); history.replaceState(null, "", a!.getAttribute("href")); scrollToSection(target);
  });
  const on = matchMedia("(min-width: 700px) and (prefers-reduced-motion: no-preference)");
  let frame = 0;
  const update = () => {
    frame = 0;
    const els = [...document.querySelectorAll<HTMLElement>("main > .stack")];
    if (!on.matches) { els.forEach(el => el.removeAttribute("style")); return; }
    const vh = innerHeight;
    // read everything first, then write; layout height so shrinking can't move the pin point
    const tops = els.map(el => el.getBoundingClientRect().top), heights = els.map(el => el.offsetHeight);
    els.forEach((el, i) => {
      const s = stackState(tops[i], heights[i], tops[i + 1] ?? null, vh);
      el.style.zIndex = String(i + 1);
      el.style.setProperty("--stick", `${s.stick}px`);
      el.style.setProperty("--cover", s.cover.toFixed(3));
      el.style.filter = s.cover > .01 ? `blur(${(s.cover * 4).toFixed(2)}px)` : ""; // only while being covered (blur is costly)
      el.style.setProperty("--tilt", `${i === 0 ? 0 : s.tilt}deg`);
    });
  };
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  on.addEventListener("change", queue);
  new ResizeObserver(queue).observe(document.body); // sections growing (Nyx chat, Compare)
  queue();
}
