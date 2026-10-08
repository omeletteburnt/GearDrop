import { describe, expect, it } from "vitest";
import { stackState } from "../../src/stack";

describe("stackState", () => {
  it("pins short sections just under the top bar", () => expect(stackState(0, 500, null, 800).stick).toBe(76));
  it("lets tall sections scroll through and pin at their bottom", () => expect(stackState(0, 2000, null, 800).stick).toBe(-1200));
  it("is uncovered until it pins, fully covered once the next section reaches the top", () => {
    expect(stackState(76, 400, 476, 800).cover).toBe(0);    // pinned, next just touching
    expect(stackState(76, 400, 276, 800).cover).toBe(0.5);
    expect(stackState(76, 400, 76, 800).cover).toBe(1);
    expect(stackState(300, 400, 700, 800).cover).toBe(0);   // short section not pinned yet, next already visible
    expect(stackState(-1200, 2000, 800, 800).cover).toBe(0); // tall section pinned at its bottom
    expect(stackState(0, 800, null, 800).cover).toBe(0);
  });
  it("tips back while entering and lies flat once in view", () => {
    expect(stackState(800, 600, null, 800).tilt).toBe(7);
    expect(stackState(520, 600, null, 800).tilt).toBe(3.5);
    expect(stackState(100, 600, null, 800).tilt).toBe(0);
  });
});
