import { describe, expect, it } from "vitest";
import { countWords, murmurWords, revealWords } from "../../src/murmur";

describe("murmurWords", () => {
  it("keeps the meaningful words of the question", () =>
    expect(murmurWords("Lightweight wireless mouse under $80 for FPS, what do you recommend?")).toEqual(["Lightweight", "wireless", "mouse", "under", "$80", "FPS", "recommend"]));
  it("drops repeats and caps the count", () => expect(murmurWords("gpu gpu GPU ram ssd cpu fan psu case mobo monitor", 4)).toEqual(["gpu", "ram", "ssd", "cpu"]));
  it("falls back when the question is all filler", () => expect(murmurWords("hi nyx, what is this?")).toEqual(["hmm", "let's see"]));
});

describe("revealWords", () => {
  const text = "Good pick.\n- **Logitech G Pro** [[listing:3]]\n- Razer";
  it("shows the first n words, keeping newlines", () => expect(revealWords(text, 3)).toBe("Good pick.\n-"));
  it("closes half-revealed bold", () => expect(revealWords(text, 5)).toBe("Good pick.\n- **Logitech G**"));
  it("returns everything once n reaches the end", () => expect(revealWords(text, countWords(text))).toBe(text));
  it("shows nothing at 0", () => expect(revealWords(text, 0)).toBe(""));
});
