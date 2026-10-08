// Homepage sections stack like cards: each one tips forward flat as it
// arrives, pins once you reach its bottom, and the next slides over it while
// it shrinks, dims and blurs slightly. Tablets/desktops only; off for reduced motion.
//
// Performance: values are written straight onto each section (never as
// inherited CSS variables, which would restyle every card inside), only when
// they change; blur moves in 0.5 px steps; fully covered sections are hidden.
const NAV = 76; // sticky top bar height
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const MEDIA = "(min-width: 700px) and (prefers-reduced-motion: no-preference)";

// Pure maths for one section (unit-tested). `top` is its on-screen top,
// `height` its height, `nextTop` the next section's top (null if last).
export function stackState(top: number, height: number, nextTop: number | null, vh: number) {
  const stick = Math.min(NAV, vh - height); // pin when the bottom is reached
  const bottom = stick + height, visible = bottom - Math.max(stick, NAV); // the part on screen once pinned
  const cover = nextTop === null ? 0 : +clamp((bottom - nextTop) / visible).toFixed(3);
  return {
    stick,
    cover, // how far the next card has slid over, counted from the moment this one pins
    // degrees still tipped back; flat once it's well in view (short last sections included)
    tilt: +((1 - clamp((vh - top) / Math.min(vh * .7, height))) * 7).toFixed(2),
    blur: Math.round(cover * 8) / 2, // 0–4 px in 0.5 px steps, so it re-renders rarely
  };
}

// Pinned sections confuse the browser's own jump-to-anchor, so jump to where
// the section really starts in the page (sum of the sections above it).
export function scrollToSection(target: Element | null) {
  const el = target?.closest<HTMLElement>("main > .stack");
  if (el && el === el.parentElement!.querySelector(":scope > .stack")) { scrollTo({ top: 0, behavior: "smooth" }); return; } // first section = page top
  if (!el || !matchMedia(MEDIA).matches) { target?.scrollIntoView({ behavior: "smooth" }); return; }
  let top = el.parentElement!.getBoundingClientRect().top + scrollY;
  for (let s = el.previousElementSibling; s; s = s.previousElementSibling) top += (s as HTMLElement).offsetHeight;
  scrollTo({ top: top - NAV, behavior: "smooth" });
}

type Css = Partial<Record<"top" | "zIndex" | "transform" | "scale" | "filter" | "visibility", string>>;
const last = new WeakMap<HTMLElement, Css & { dim?: string }>();
function write(el: HTMLElement, css: Css, dim: string) {
  const prev = last.get(el) ?? {};
  for (const k of Object.keys(css) as (keyof Css)[]) if (prev[k] !== css[k]) el.style[k] = css[k]!;
  if (prev.dim !== dim) { const d = el.querySelector<HTMLElement>(":scope > .stack-dim"); if (d) d.style.opacity = dim; }
  last.set(el, { ...css, dim });
}

export function installStack() {
  document.addEventListener("click", e => {
    const a = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
    const target = a && a.getAttribute("href")!.length > 1 ? document.querySelector(a.getAttribute("href")!) : null;
    if (!target?.closest("main > .stack")) return;
    e.preventDefault(); history.replaceState(null, "", a!.getAttribute("href")); scrollToSection(target);
  });
  const on = matchMedia(MEDIA);
  let frame = 0;
  const update = () => {
    frame = 0;
    const els = [...document.querySelectorAll<HTMLElement>("main > .stack")];
    if (!on.matches) {
      els.forEach(el => { if (last.has(el)) { el.removeAttribute("style"); el.querySelector<HTMLElement>(":scope > .stack-dim")?.removeAttribute("style"); last.delete(el); } });
      return;
    }
    const vh = innerHeight;
    // read everything first, then write. Shrink and tilt pivot on the bottom edge,
    // so bottom minus layout height is the true top, unaffected by our own effects.
    const heights = els.map(el => el.offsetHeight), tops = els.map((el, i) => el.getBoundingClientRect().bottom - heights[i]);
    els.forEach((el, i) => {
      const s = stackState(tops[i], heights[i], tops[i + 1] ?? null, vh);
      const tilt = i === 0 ? 0 : s.tilt;
      write(el, {
        top: `${s.stick}px`, zIndex: String(i + 1),
        transform: tilt > .05 ? `perspective(1400px) rotateX(${tilt}deg)` : "",
        scale: s.cover > 0 ? (1 - s.cover * .05).toFixed(3) : "",
        filter: s.blur ? `blur(${s.blur}px)` : "",
        visibility: s.cover >= .999 ? "hidden" : "",
      }, (s.cover * .45).toFixed(2));
    });
  };
  const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue);
  on.addEventListener("change", queue);
  new ResizeObserver(queue).observe(document.body); // sections growing (Nyx chat, Compare)
  queue();
}
