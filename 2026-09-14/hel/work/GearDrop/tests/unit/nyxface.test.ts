import { describe, expect, it } from "vitest";
import { lookToward } from "../../src/NyxFace";

describe("lookToward", () => {
  it("stays centred when the cursor is on the face", () => expect(lookToward(50, 50, 50, 50)).toEqual({ x: 0, y: 0 }));
  it("leans fully toward a far-away cursor", () => expect(lookToward(0, 0, 1000, 0)).toEqual({ x: 1, y: 0 }));
  it("leans partly toward a nearby cursor", () => expect(lookToward(0, 0, 0, -120)).toEqual({ x: 0, y: -0.5 }));
  it("never leans past 1", () => { const l = lookToward(0, 0, 900, 900); expect(Math.hypot(l.x, l.y)).toBeLessThanOrEqual(1.0001); });
});
