import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { lookToward, watchPointer } from "./NyxFace";
import { MEDIA, NAV } from "./stack";
import "./nyxmascot.css";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const SIZE = 104, PEEK = 70, CLIMB = 96, WATCH = 200, JUMP = 300; // px of face over the edge; how long he stares first; how far below him he jumps to
const FAST = 6, FAST_STEPS = 3; // px per ms of scrolling, held for this many scroll steps, that counts as "way too fast"
const TICKLE = 90; // px of recent wiggling around his tummy before he giggles
const FLAIL_AFTER = 5000, TICKLE_MAX = 30000, PAUSE = 1500; // ms of tickling before his hands flail; the most he'll take; how long a pause still counts

export type ByeStage = "none" | "watch" | "grab" | "peek" | "wave" | "climb" | "gone";

// Pure maths for the goodbye (unit-tested). `edge` is the on-screen top of the
// section sliding over Nyx, `bottom` Nyx's own bottom, `vh` the window height.
// He stares down at the rising edge, jumps onto it, then rides it up: peeking
// over, waving, and climbing up over the top bar, and leaping off once it covers his section completely.
// `show` is how many px of his face stick up over the edge; `look` how hard he stares down (0–1).
export function jumpAt(bottom: number, vh: number) { return Math.min(bottom + JUMP, vh - 120); }
export function byeState(edge: number, bottom: number, vh: number, nav = NAV): { stage: ByeStage; show: number; look: number } {
  const jump = jumpAt(bottom, vh);
  if (edge >= jump + WATCH) return { stage: "none", show: 0, look: 0 };
  if (edge > jump) return { stage: "watch", show: 0, look: +(1 - (edge - jump) / WATCH).toFixed(3) };
  const p = clamp((jump - edge) / Math.max(60, jump - nav)); // 1 = the section is fully covered
  if (p < .1) return { stage: "grab", show: PEEK, look: 1 };
  if (p < .62) return { stage: "peek", show: PEEK, look: 0 };
  if (p < .92) return { stage: "wave", show: PEEK, look: 0 };
  if (p < 1) return { stage: "climb", show: Math.round(PEEK + (CLIMB - PEEK) * (p - .92) / .08), look: 0 };
  return { stage: "gone", show: 0, look: 0 };
}

// Tickling (unit-tested): is a point (0–1 across/down Nyx's box) on his tummy,
// and how much wiggling has built up (fades away over about half a second)?
// His tummy is the lower-right curve of his body: a band around his edge, from his
// right side round to the bottom, hugging the outline (a little inside and outside it).
export function onTummy(rx: number, ry: number) {
  const dx = rx - .5, dy = ry - .5, d = Math.hypot(dx, dy), deg = Math.atan2(dy, dx) * 180 / Math.PI;
  return d > .38 && d < .72 && deg > -10 && deg < 100;
}
export const tickleLevel = (level: number, moved: number, ms: number) => level * Math.exp(-ms / 600) + moved;
// Tickle timing (unit-tested): `since` is when this bout of tickling began, `last` the
// previous tickle. A pause longer than PAUSE starts the count again. After 5 s his hands
// flail; after 30 s he's had enough.
export function tickleBout(since: number, last: number, now: number) {
  const start = !since || now - last > PAUSE ? now : since;
  return { since: start, flail: now - start >= FLAIL_AFTER, enough: now - start >= TICKLE_MAX };
}

// Reaching for a still cursor (unit-tested): two arms, one from each side of his body
// (centre cx, cy, radius r), stretching as far as it takes to cup the cursor from the
// left and the right. null when the cursor is right on top of him.
export const REACH_AFTER = 2000; // ms the cursor has to stay still
export type Arm = { x: number; y: number; angle: number; length: number };
export function reachArms(cx: number, cy: number, r: number, x: number, y: number): [Arm, Arm] | null {
  const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
  if (d < 80) return null;
  const arm = (side: 1 | -1): Arm => {
    const ax = cx + r * side, ay = cy + 6; // shoulder: his left (-1) or right (+1) side
    const tx = x + 18 * side, ty = y; // that side of the cursor
    return { x: Math.round(ax), y: Math.round(ay), angle: +(Math.atan2(ty - ay, tx - ax) * 180 / Math.PI).toFixed(2), length: Math.max(0, Math.round(Math.hypot(tx - ax, ty - ay) - 13)) };
  };
  return [arm(-1), arm(1)];
}

// Clicked while hanging on the edge: fly away from where you clicked, spinning (dx, dy in px).
export function flickAway(cx: number, cy: number, x: number, y: number, dist = 420) {
  const dx = cx - x, dy = cy - y, d = Math.hypot(dx, dy) || 1;
  return { dx: Math.round(dx / d * dist), dy: Math.round(dy / d * dist - 120), spin: dx < 0 ? -540 : 540 };
}

const face = <><span className="antenna">✦</span><span className="m-eyes"><span className="brow left" /><span className="brow right" /><span className="eye left" /><span className="eye right" /></span><span className="glow" /></>;

// The big homepage Nyx: follows the cursor with eyes and head, blinks and
// glances, watches you type, braces against the screen on very fast scrolls, and
// when the next section slides over him (scrolling down) he hops onto its edge,
// peeks over, waves bye, climbs over the top bar and leaps off the screen.
// Scroll back up before he's left and he just holds on, riding the edge back down
// and hopping home once it's below him; after he's leapt off, he's simply back in his spot. Wiggle the cursor on his tummy and he giggles; click him
// while he's holding on and he gets flicked off.
export function NyxMascot({ greet }: { greet: boolean }) {
  const spot = useRef<HTMLDivElement>(null), bye = useRef<HTMLDivElement>(null), stageRef = useRef<ByeStage>("none");
  const [stage, setStage] = useState<ByeStage>("none");
  const [blink, setBlink] = useState(false);
  const [brace, setBrace] = useState(false);
  const [leaving, setLeaving] = useState(false); // the leap off the top of the screen
  const [flicked, setFlicked] = useState(false); // flicked off the edge: gone until he's back home
  const [left, setLeft] = useState(false); // leapt off: no riding back, he reappears in his spot
  const offEdge = useRef(false); // left or flicked: nothing to hop home from
  const [tickled, setTickled] = useState(false);
  const [flail, setFlail] = useState(false); // tickled for 5 s: hands flail trying to stop it
  const [settle, setSettle] = useState(0); // tickling stopped: 1 = giggles slowing, 2 = just smiling
  const [hey, setHey] = useState(false); // flicked mid bye-bye: "hey!"
  const [angry, setAngry] = useState(false); // back home after being flicked: grumpy for 3 s
  const [reach, setReach] = useState(false); // cursor still for 2 s: slowly reaching for it
  const [arms, setArms] = useState<{ pair: [Arm, Arm]; cx: number; cy: number; r: number } | null>(null);
  const [examining, setExamining] = useState(false); // hands got there: poking at it
  const [checking, setChecking] = useState(false); // mid-examining: glances out to see if you're watching
  const [innocent, setInnocent] = useState(0); // caught reaching: 1 = whistling, looking around (5 s), 2–3 = easing back
  const busy = useRef(false); // doing something else, so no reaching
  const wasFlicked = useRef(false);
  const [happy, setHappy] = useState(false);
  const [reading, setReading] = useState(false);
  const readingRef = useRef(false);
  const alive = !reducedMotion();

  // Blinks every 3–6 s, sometimes a glance to one side or an antenna twitch.
  useEffect(() => {
    if (!alive) return;
    let t: number, glanceT: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlink(true); window.setTimeout(() => setBlink(false), 140);
        const el = spot.current, r = Math.random();
        if (el && r < .3) {
          el.style.setProperty("--gx", String(Math.random() < .5 ? -1 : 1));
          glanceT = window.setTimeout(() => el.style.setProperty("--gx", "0"), 900);
        } else if (el && r < .5) el.querySelector(".antenna")?.animate([{ rotate: "0deg" }, { rotate: "-18deg" }, { rotate: "14deg" }, { rotate: "0deg" }], { duration: 500 });
        loop();
      }, 3000 + Math.random() * 3000);
    };
    loop();
    return () => { clearTimeout(t); clearTimeout(glanceT); };
  }, [alive]);

  // Eyes and head follow the cursor (CSS variables, no re-render), unless he's reading your question.
  useEffect(() => {
    if (!alive) return;
    let px = 0, py = 0, pt = 0, level = 0, wasOn = false, since = 0, last = 0, enough = false, timers: number[] = [];
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    // Settles down slowly: flailing stops and the giggles slow, then just a smile, then calm.
    const settleDown = () => {
      clear(); setTickled(false); setFlail(false); setSettle(1);
      timers.push(window.setTimeout(() => setSettle(2), 1400), window.setTimeout(() => setSettle(0), 2800));
    };
    const stop = watchPointer((x, y) => {
      const el = spot.current; if (!el) return;
      const r = el.getBoundingClientRect(), now = performance.now();
      const on = onTummy((x - r.left) / r.width, (y - r.top) / r.height) && stageRef.current !== "gone";
      if (on) {
        // only wiggles on his tummy count, not the jump onto it
        level = tickleLevel(wasOn ? level : 0, wasOn ? Math.hypot(x - px, y - py) : 0, now - pt);
        if (level > TICKLE && !enough) {
          const bout = tickleBout(since, last, now);
          since = bout.since; last = now;
          if (bout.enough) { enough = true; settleDown(); } // 30 s is his limit: ignores you until you move off his tummy
          else {
            clear(); setSettle(0); setTickled(true); setFlail(bout.flail);
            timers.push(window.setTimeout(settleDown, 700)); // stop tickling and he calms down
          }
        }
      } else { level = 0; enough = false; }
      wasOn = on;
      px = x; py = y; pt = now;
      if (readingRef.current) return;
      const l = lookToward(r.left + r.width / 2, r.top + r.height / 2, x, y, 420);
      el.style.setProperty("--lx", String(l.x)); el.style.setProperty("--ly", String(l.y));
    });
    return () => { stop(); clear(); };
  }, [alive]);

  // Leave the cursor still for 2 s and he slowly reaches out for it; move (or scroll)
  // and the arms snap back while he whistles and looks around for 5 s, as if nothing
  // happened, then eases back. 3 s later, if the cursor is still, he tries again.
  useEffect(() => {
    if (!alive) return;
    let idleT = 0, innocentT = 0, examineT = 0, reaching = false, cx = -1, cy = -1, movedAt = 0;
    const caught = () => {
      if (!reaching) return;
      reaching = false; setReach(false); setExamining(false); clearTimeout(examineT); setInnocent(1);
      clearTimeout(innocentT);
      innocentT = window.setTimeout(() => {
        setInnocent(2); // hold his last pose, then glide back to normal
        innocentT = window.setTimeout(() => {
          setInnocent(3);
          innocentT = window.setTimeout(() => { setInnocent(0); clearTimeout(idleT); idleT = window.setTimeout(tryReach, 3000); }, 1200); // ...then the loop again
        }, 50);
      }, 5000);
    };
    const tryReach = () => {
      const still = performance.now() - movedAt;
      if (still < REACH_AFTER) { idleT = window.setTimeout(tryReach, REACH_AFTER - still); return; } // moved since: wait for 2 s of stillness
      const el = spot.current; if (!el || busy.current) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < NAV || r.top > innerHeight) return; // not on screen
      const sec = el.closest("main > .stack")?.getBoundingClientRect(); // only for a cursor inside his section
      if (!sec || cx < sec.left || cx > sec.right || cy < Math.max(sec.top, NAV) || cy > sec.bottom) return;
      const mx = r.left + r.width / 2, my = r.top + r.height / 2, rad = r.width * .46;
      const to = reachArms(mx, my, rad, cx, cy); if (!to) return;
      setArms({ pair: to, cx: mx, cy: my, r: r.width / 2 + 10 }); reaching = true;
      // place the arms first, then stretch them next frame (so they grow from nothing)
      requestAnimationFrame(() => requestAnimationFrame(() => { if (reaching) setReach(true); }));
      examineT = window.setTimeout(() => setExamining(true), 3000); // arms take 3 s to get there
    };
    const stop = watchPointer((x, y) => {
      if (x === cx && y === cy) return;
      cx = x; cy = y; movedAt = performance.now(); caught();
      clearTimeout(idleT); idleT = window.setTimeout(tryReach, REACH_AFTER);
    });
    const scrolled = () => { movedAt = performance.now(); caught(); clearTimeout(idleT); if (cx >= 0) idleT = window.setTimeout(tryReach, REACH_AFTER); };
    addEventListener("scroll", scrolled, { passive: true });
    return () => { stop(); removeEventListener("scroll", scrolled); clearTimeout(idleT); clearTimeout(innocentT); clearTimeout(examineT); };
  }, [alive]);

  // While examining, every few seconds he glances straight out at you (are you watching?),
  // freezes for a moment, then goes back to being curious.
  useEffect(() => {
    if (!examining) return;
    let t = 0;
    const loop = () => {
      t = window.setTimeout(() => {
        setChecking(true);
        t = window.setTimeout(() => { setChecking(false); loop(); }, 900);
      }, 2500 + Math.random() * 2500);
    };
    loop();
    return () => { clearTimeout(t); setChecking(false); };
  }, [examining]);

  // Click him while he's holding on to the edge and he's knocked over backwards: pops up
  // so all of him shows, tips back, and drops behind the section until the last pixel is
  // gone (gone until he's back home).
  const flick = (e: MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), f = flickAway(r.left + r.width / 2, r.top + r.height / 2, e.clientX, e.clientY);
    const drift = Math.round(f.dx * .1), tip = f.spin > 0 ? 1 : -1;
    setFlicked(true); offEdge.current = true; wasFlicked.current = true;
    if (stage === "wave") { setHey(true); window.setTimeout(() => setHey(false), 1300); }
    e.currentTarget.animate([
      { translate: "0 0", transform: "perspective(500px) rotateX(0deg)", easing: "ease-out" }, // knocked up...
      { translate: `${drift}px -${SIZE - PEEK + 24}px`, transform: `perspective(500px) rotateX(30deg) rotate(${tip * 8}deg)`, offset: .4, easing: "ease-in" }, // ...then gravity
      { translate: `${drift * 2}px ${PEEK + 60}px`, transform: `perspective(500px) rotateX(65deg) rotate(${tip * 20}deg)` },
    ], { duration: 1000, fill: "forwards" });
  };

  // Watches the question box: looks at it while you type, nods along, smiles when you ask.
  useEffect(() => {
    const el = spot.current, panel = el?.closest(".nyx-panel");
    if (!el || !panel || !alive) return;
    let happyT = 0;
    const isBox = (t: EventTarget | null) => t instanceof HTMLTextAreaElement;
    const lookAtBox = (box: Element) => {
      const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
      const l = lookToward(r.left + r.width / 2, r.top + r.height / 2, b.left + b.width / 2, b.top + b.height / 2, 420);
      el.style.setProperty("--lx", String(l.x)); el.style.setProperty("--ly", String(l.y));
    };
    const focusIn = (e: Event) => { if (!isBox(e.target)) return; readingRef.current = true; setReading(true); lookAtBox(e.target as Element); };
    const focusOut = (e: Event) => { if (!isBox(e.target)) return; readingRef.current = false; setReading(false); };
    const typed = (e: Event) => { if (isBox(e.target)) el.querySelector(".m-eyes")?.animate([{ translate: "0 0" }, { translate: "0 3px" }, { translate: "0 0" }], { duration: 200 }); };
    const asked = () => { setHappy(true); clearTimeout(happyT); happyT = window.setTimeout(() => setHappy(false), 1500); };
    panel.addEventListener("focusin", focusIn); panel.addEventListener("focusout", focusOut);
    panel.addEventListener("input", typed); panel.addEventListener("submit", asked);
    return () => {
      clearTimeout(happyT);
      panel.removeEventListener("focusin", focusIn); panel.removeEventListener("focusout", focusOut);
      panel.removeEventListener("input", typed); panel.removeEventListener("submit", asked);
    };
  }, [alive]);

  // Scrolling: the goodbye as the next section slides over, and bracing on very fast scrolls.
  useEffect(() => {
    if (!alive) return;
    const on = matchMedia(MEDIA);
    let frame = 0, lastY = scrollY, lastT = performance.now(), speed = 0, fastSteps = 0, braceT = 0, leaveT = 0, angryT = 0, up = false;
    const update = () => {
      frame = 0;
      const el = spot.current, o = bye.current; if (!el || !o) return;
      const next = el.closest("main > .stack")?.nextElementSibling;
      const r = el.getBoundingClientRect();
      const edge = next ? next.getBoundingClientRect().top : Infinity;
      const full = on.matches ? byeState(edge, r.bottom, innerHeight) : byeState(Infinity, 0, innerHeight);
      // On the way back up he doesn't wave or climb, he just holds on.
      const s = up && (full.stage === "wave" || full.stage === "climb") ? { ...full, stage: "peek" as const, show: PEEK } : full;
      el.style.setProperty("--wl", String(s.look));
      o.style.left = `${r.left + r.width / 2}px`;
      if (next) o.style.top = `${Math.max(edge, NAV)}px`; // leaps from the top bar, not from wherever the edge scrolled to
      o.style.setProperty("--show", `${s.show}px`);
      if (s.stage !== stageRef.current) {
        const prev = stageRef.current;
        stageRef.current = s.stage; setStage(s.stage);
        const riding = (st: ByeStage) => st !== "none" && st !== "watch" && st !== "gone";
        // Back below him on the way up: hop from the edge back into his spot.
        if (s.stage === "watch" && riding(prev) && !offEdge.current) {
          el.querySelector(".nyx-mascot")?.animate([{ translate: `0 ${edge - PEEK - r.top}px` }, { translate: `0 ${(edge - PEEK - r.top) * .5 - 40}px`, offset: .5 }, { translate: "0 0" }], { duration: 380, easing: "ease-out" });
        }
        if (s.stage === "none" || s.stage === "watch") { // back home: reset everything for the next goodbye
          if (wasFlicked.current) { wasFlicked.current = false; setAngry(true); clearTimeout(angryT); angryT = window.setTimeout(() => setAngry(false), 3000); }
          setFlicked(false); setLeft(false); offEdge.current = false;
          o.querySelector(".bye-face")?.getAnimations().forEach(a => a.cancel());
        }
        // Fully covered: leap off the top bar (unless he was already flicked off).
        if (s.stage === "gone" && prev === "climb" && !offEdge.current) { setLeaving(true); setLeft(true); offEdge.current = true; clearTimeout(leaveT); leaveT = window.setTimeout(() => setLeaving(false), 800); }
        else setLeaving(false);
        // Landing on the edge: hop from where he was standing down onto it.
        if (s.stage === "grab" && prev === "watch") o.querySelector(".bye-face")?.animate([
          { translate: `0 ${r.top - (edge - PEEK)}px` }, { translate: `0 ${(r.top - (edge - PEEK)) * .5 - 50}px`, offset: .35 }, { translate: "0 0" },
        ], { duration: 420, easing: "ease-in" });
      }
    };
    const onScroll = () => {
      const now = performance.now(), dt = now - lastT, dy = scrollY - lastY;
      lastT = now; lastY = scrollY;
      if (dy) up = dy < 0;
      if (dt > 0 && dt < 120) speed = speed * .5 + Math.abs(dy) / dt * .5; else speed = 0;
      fastSteps = speed > FAST ? fastSteps + 1 : 0;
      if (fastSteps >= FAST_STEPS) {
        setBrace(true); clearTimeout(braceT);
        braceT = window.setTimeout(() => setBrace(false), 650); // holds on while the fast scroll lasts
      }
      if (!frame) frame = requestAnimationFrame(update);
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", queue);
    on.addEventListener("change", queue);
    queue();
    return () => {
      cancelAnimationFrame(frame); clearTimeout(braceT); clearTimeout(leaveT); clearTimeout(angryT);
      removeEventListener("scroll", onScroll); removeEventListener("resize", queue); on.removeEventListener("change", queue);
    };
  }, [alive]);

  const away = stage !== "none" && stage !== "watch" && !left; // the peeking copy has taken over
  busy.current = brace || angry || tickled || settle > 0 || innocent > 0 || reading || away || happy || greet;
  const mood = brace ? " shock brace" : angry ? " angry" : tickled ? ` tickled${flail ? " flail" : ""}` : settle === 1 ? " tickled settling" : settle === 2 ? " afterglow" : innocent === 1 ? " innocent" : innocent === 2 ? " easing easing-hold" : innocent === 3 ? " easing" : examining && reach ? (checking ? " curious checking" : " curious") : happy || greet ? " greet" : "";
  return <>
    <div ref={spot} className={`nyx-spot${reading ? " reading" : ""}${away ? " away" : ""}${reach && !busy.current ? " reaching" : ""}`}>
      <div className="nyx-lean">
        <div className={`nyx-mascot${mood}${blink ? " blink" : ""}`} aria-label="Animated Nyx assistant">{face}</div>
        <span className={`tickle-text${(tickled || settle === 1) && !angry ? " on" : ""}${settle === 1 ? " fading" : ""}`} aria-hidden="true">{settle === 1 ? "hehe…" : flail ? "haha stop!" : "hehe!"}</span>
        <span className={`angry-mark${angry ? " on" : ""}`} aria-hidden="true">💢</span>
        <span className={`whistle${innocent === 1 ? " on" : ""}`} aria-hidden="true">♪</span>
        <span className="brace-hand left" /><span className="brace-hand right" />
      </div>
    </div>
    {alive && createPortal(
      <div className={`nyx-reach${reach && !busy.current ? " reaching" : ""}${examining ? " examining" : ""}${checking ? " checking" : ""}`} aria-hidden="true"
        style={arms ? { "--hole": `circle ${arms.r}px at ${arms.cx}px ${arms.cy}px` } as CSSProperties : undefined}>
        {arms?.pair.map((a, i) => <span key={i} className="reach-arm" style={{ left: a.x, top: a.y, rotate: `${a.angle}deg`, "--rl": `${a.length}px` } as CSSProperties}><span className="reach-hand" /></span>)}
      </div>, document.body)}
    {alive && createPortal(
      <div ref={bye} className={`nyx-bye stage-${stage}${leaving ? " leaving" : ""}${flicked ? " flicked" : ""}${hey ? " hey" : ""}${left && !leaving ? " left" : ""}${brace ? " brace" : ""}`} aria-hidden="true">
        <div className="bye-clip"><div className={`nyx-mascot bye-face${brace || flicked ? " shock" : blink ? " blink" : ""}`} onClick={flick}>{face}</div></div>
        <span className="bye-hand left" /><span className="bye-hand right" />
        <span className="bye-bubble">{hey ? "hey!" : "bye bye! 👋"}</span>
      </div>, document.body)}
  </>;
}
