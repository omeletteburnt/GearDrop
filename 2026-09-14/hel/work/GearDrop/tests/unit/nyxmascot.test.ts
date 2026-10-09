import { describe, expect, it } from "vitest";
import { byeState, flickAway, jumpAt, reachArms, onTummy, tickleBout, tickleLevel } from "../../src/NyxMascot";

// Nyx's bottom at 400 px in a 1000 px window, top bar at 76: he jumps onto the
// edge at 700 and the goodbye plays while it rises from 700 to 76 (section fully covered).
const at = (edge: number) => byeState(edge, 400, 1000, 76);

describe("jumpAt", () => {
  it("is a little below Nyx", () => expect(jumpAt(400, 1000)).toBe(700));
  it("never sits in the bottom 120 px of a short window", () => expect(jumpAt(400, 600)).toBe(480));
});

describe("byeState", () => {
  it("ignores a section that's still far below", () => expect(at(1200)).toEqual({ stage: "none", show: 0, look: 0 }));
  it("stares down harder as the edge approaches", () => {
    expect(at(800)).toMatchObject({ stage: "watch", look: 0.5 });
    expect(at(701).look).toBeGreaterThan(at(850).look);
  });
  it("jumps on, peeks over with 70 px showing, then waves", () => {
    expect(at(700)).toMatchObject({ stage: "grab", show: 70 });
    expect(at(550)).toMatchObject({ stage: "peek", show: 70 });
    expect(at(300)).toMatchObject({ stage: "wave", show: 70 });
  });
  it("saves the bye-bye for late in the scroll", () => {
    expect(at(360).stage).toBe("peek"); // past halfway, still just peeking
    expect(at(250).stage).toBe("wave");
  });
  it("climbs up over the edge (and the top bar), then is gone", () => {
    const climbing = at(110);
    expect(climbing.stage).toBe("climb");
    expect(climbing.show).toBeGreaterThan(70);
    expect(at(90).show).toBeGreaterThan(climbing.show);
    expect(at(77).stage).toBe("climb"); // hangs on until the very end
    expect(at(76)).toEqual({ stage: "gone", show: 0, look: 0 });
  });
  it("plays in order as you scroll down", () => {
    const order = [...new Set(Array.from({ length: 1200 }, (_, i) => at(1200 - i).stage))];
    expect(order).toEqual(["none", "watch", "grab", "peek", "wave", "climb", "gone"]);
  });
});

describe("tickling", () => {
  it("counts the lower-right curve of his body as his tummy", () => {
    expect(onTummy(0.95, 0.55)).toBe(true); // right side
    expect(onTummy(0.85, 0.85)).toBe(true); // lower right edge
    expect(onTummy(1.0, 0.85)).toBe(true); // just outside his outline
    expect(onTummy(0.55, 1.1)).toBe(true); // round to the bottom
    expect(onTummy(1.2, 1.2)).toBe(false); // too far out
    expect(onTummy(0.55, 0.55)).toBe(false); // the middle of his face
    expect(onTummy(0.15, 0.85)).toBe(false); // lower left
    expect(onTummy(0.9, 0.2)).toBe(false); // upper right
  });
  it("builds up with quick wiggles and fades when you stop", () => {
    let level = 0;
    for (let i = 0; i < 8; i++) level = tickleLevel(level, 15, 16);
    expect(level).toBeGreaterThan(90);
    expect(tickleLevel(level, 0, 2000)).toBeLessThan(15);
  });
  it("flails his hands after 5 s of tickling and has had enough at 30 s", () => {
    expect(tickleBout(0, 0, 1000)).toEqual({ since: 1000, flail: false, enough: false });
    expect(tickleBout(1000, 5900, 6000)).toMatchObject({ flail: true, enough: false });
    expect(tickleBout(1000, 30900, 31000)).toMatchObject({ flail: true, enough: true });
  });
  it("forgives short pauses but restarts the count after a long one", () => {
    expect(tickleBout(1000, 3000, 4200).since).toBe(1000); // 1.2 s pause
    expect(tickleBout(1000, 3000, 5000)).toEqual({ since: 5000, flail: false, enough: false }); // 2 s pause
  });
});

describe("flickAway", () => {
  it("flies away from where you clicked, and a bit upward", () => {
    const f = flickAway(100, 100, 80, 100);
    expect(f.dx).toBeGreaterThan(0);
    expect(f.dy).toBeLessThan(0);
    expect(f.spin).toBe(540);
  });
  it("spins the other way when clicked from the right", () => expect(flickAway(100, 100, 130, 100).spin).toBe(-540));
});

describe("reachArms", () => {
  const end = (a: { x: number; y: number; angle: number; length: number }) => [a.x + Math.cos(a.angle * Math.PI / 180) * (a.length + 13), a.y + Math.sin(a.angle * Math.PI / 180) * (a.length + 13)];
  it("reaches out from his left and right sides", () => {
    const [l, r] = reachArms(0, 0, 48, 0, 300)!;
    expect([l.x, l.y]).toEqual([-48, 6]);
    expect([r.x, r.y]).toEqual([48, 6]);
  });
  it("cups the cursor from the left and the right, however far away", () => {
    const arms = reachArms(0, 0, 48, -900, 200)!;
    const [l, r] = arms.map(end);
    expect(Math.hypot(l[0] + 918, l[1] - 200)).toBeLessThan(2);
    expect(Math.hypot(r[0] + 882, r[1] - 200)).toBeLessThan(2);
    expect(arms[1].length).toBeGreaterThan(800); // no limit on how far he stretches
  });
  it("doesn't reach for a cursor that's right on top of him", () => expect(reachArms(0, 0, 48, 30, 20)).toBeNull());
});
