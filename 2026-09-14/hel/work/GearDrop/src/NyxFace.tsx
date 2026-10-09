import { useEffect, useRef, useState } from "react";
import "./nyxface.css";

export type NyxMood = "idle" | "thinking" | "talking" | "happy" | "sad";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// One shared pointer listener for every face on the page (not one per face).
type Watcher = (x: number, y: number) => void;
const watchers = new Set<Watcher>();
let frame = 0, lastX = 0, lastY = 0;
function onMove(e: PointerEvent) {
  lastX = e.clientX; lastY = e.clientY;
  if (!frame) frame = requestAnimationFrame(() => { frame = 0; watchers.forEach(w => w(lastX, lastY)); });
}
export function watchPointer(w: Watcher) {
  if (!watchers.size) window.addEventListener("pointermove", onMove, { passive: true });
  watchers.add(w);
  return () => { watchers.delete(w); if (!watchers.size) window.removeEventListener("pointermove", onMove); };
}

// Pure helper (unit-tested): how far the eyes lean toward a point, each axis in -1..1.
export function lookToward(cx: number, cy: number, x: number, y: number, reach = 240) {
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (!d) return { x: 0, y: 0 };
  const k = Math.min(d, reach) / reach / d;
  return { x: +(dx * k).toFixed(3), y: +(dy * k).toFixed(3) };
}

// Nyx's little face: blinks, glances around, follows the cursor, reacts to the
// chat via `mood`, and bounces with a smile when clicked. `still` freezes it
// (used for older answers so a long chat isn't full of blinking faces).
export function NyxFace({ mood = "idle", size = "mini", still = false }: { mood?: NyxMood; size?: "mini" | "tiny"; still?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [blink, setBlink] = useState(false);
  const [greet, setGreet] = useState(false);
  const alive = !still && !reducedMotion();

  // Random blinks every 3–6 s, and now and then a quick glance to one side.
  useEffect(() => {
    if (!alive) return;
    let t: number, glanceT: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true); window.setTimeout(() => setBlink(false), 140);
        const el = ref.current;
        if (el && Math.random() < .3) {
          el.style.setProperty("--gx", String(Math.random() < .5 ? -1 : 1));
          glanceT = window.setTimeout(() => el.style.setProperty("--gx", "0"), 900);
        }
        loop();
      }, 3000 + Math.random() * 3000);
    };
    loop();
    return () => { clearTimeout(t); clearTimeout(glanceT); };
  }, [alive]);

  // Eyes follow the cursor (written straight to CSS variables, no re-render).
  useEffect(() => {
    if (!alive) return;
    return watchPointer((x, y) => {
      const el = ref.current; if (!el) return;
      const r = el.getBoundingClientRect();
      const look = lookToward(r.left + r.width / 2, r.top + r.height / 2, x, y);
      el.style.setProperty("--lx", String(look.x)); el.style.setProperty("--ly", String(look.y));
    });
  }, [alive]);

  useEffect(() => { if (!greet) return; const t = setTimeout(() => setGreet(false), 1200); return () => clearTimeout(t); }, [greet]);

  const shown = greet ? "happy" : mood;
  return <span ref={ref} aria-hidden="true" onClick={() => !still && setGreet(true)}
    className={`nyx-face ${size} mood-${shown}${blink ? " blink" : ""}${greet ? " greet" : ""}${still ? " still" : ""}`}>
    <span className="nf-eyes"><span className="nf-eye" /><span className="nf-eye" /></span>
    <span className="nf-mouth" />
  </span>;
}
