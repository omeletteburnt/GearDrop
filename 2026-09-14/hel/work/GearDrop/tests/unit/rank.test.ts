import { describe, expect, it } from "vitest";
import { rank } from "../../src/recommend";
import type { Listing } from "../../src/data";

function listing(overrides: Partial<Listing>): Listing {
  return {
    id: 1,
    name: "Test Mouse",
    category: "Mouses",
    price: 50,
    condition: "Good",
    status: "Available",
    image: "https://example.com/x.jpg",
    description: "A wireless mouse for FPS games",
    specs: { Weight: "60 g", Connection: "Wireless" },
    missing: [],
    seller: "Someone",
    posted: "Just now",
    ...overrides,
  };
}

describe("rank", () => {
  it("scores available listings higher than sold/reserved ones", () => {
    const available = listing({ status: "Available" });
    const sold = listing({ status: "Sold" });
    expect(rank(available, "")).toBeGreaterThan(rank(sold, ""));
  });

  it("rewards keyword matches in name/description/specs", () => {
    const matching = listing({ description: "lightweight wireless mouse for FPS" });
    const nonMatching = listing({ name: "Keyboard", description: "mechanical keyboard", specs: {} });
    const need = "lightweight wireless mouse for FPS";
    expect(rank(matching, need)).toBeGreaterThan(rank(nonMatching, need));
  });

  it("rewards items at or under the budget mentioned in the need text", () => {
    const cheap = listing({ price: 40 });
    const expensive = listing({ price: 999 });
    const need = "mouse under $80";
    expect(rank(cheap, need)).toBeGreaterThan(rank(expensive, need));
  });
});
