import { describe, expect, it } from "vitest";
import { safeImageUrl, validateListing, type ListingDraft } from "../../src/validation";

function draft(overrides: Partial<ListingDraft> = {}): ListingDraft {
  return {
    seller: "Kai",
    name: "Logitech G Pro X",
    category: "Mouses",
    price: "50",
    condition: "Good",
    description: "A lightly used gaming mouse.",
    details: "",
    ...overrides,
  };
}

describe("validateListing", () => {
  it("accepts a well-formed draft", () => {
    const result = validateListing(draft());
    expect("value" in result).toBe(true);
  });

  it("rejects a blank name", () => {
    const result = validateListing(draft({ name: "   " }));
    expect("error" in result).toBe(true);
  });

  it("rejects a non-positive price", () => {
    expect("error" in validateListing(draft({ price: "0" }))).toBe(true);
    expect("error" in validateListing(draft({ price: "-5" }))).toBe(true);
    expect("error" in validateListing(draft({ price: "not-a-number" }))).toBe(true);
  });

  it("rejects a price over the sanity ceiling", () => {
    expect("error" in validateListing(draft({ price: "999999" }))).toBe(true);
  });

  it("rejects a category not in the allowed set (e.g. a tampered form field)", () => {
    expect("error" in validateListing(draft({ category: "Consoles" }))).toBe(true);
  });

  it("rejects a condition not in the allowed set", () => {
    expect("error" in validateListing(draft({ condition: "Broken" }))).toBe(true);
  });

  it("rejects an empty description", () => {
    expect("error" in validateListing(draft({ description: "" }))).toBe(true);
  });
});

describe("safeImageUrl", () => {
  it("allows http(s) URLs through unchanged", () => {
    expect(safeImageUrl("https://images.unsplash.com/photo.jpg")).toBe("https://images.unsplash.com/photo.jpg");
    expect(safeImageUrl("http://example.com/photo.jpg")).toBe("http://example.com/photo.jpg");
  });

  it("falls back to the placeholder for a javascript: URI", () => {
    expect(safeImageUrl("javascript:alert(1)")).toBe("/placeholder-product.svg");
  });

  it("falls back to the placeholder for a data: URI", () => {
    expect(safeImageUrl("data:text/html,<script>alert(1)</script>")).toBe("/placeholder-product.svg");
  });

  it("falls back to the placeholder for a schemeless/relative-looking string", () => {
    expect(safeImageUrl("not-a-url")).toBe("/placeholder-product.svg");
  });
});
