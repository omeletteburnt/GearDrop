import { describe, expect, it } from "vitest";
import { isPlaceholderEmail } from "../../src/supabase";

describe("isPlaceholderEmail", () => {
  it("treats missing and @nyx.local addresses as 'no email added'", () => {
    expect(isPlaceholderEmail(undefined)).toBe(true);
    expect(isPlaceholderEmail("")).toBe(true);
    expect(isPlaceholderEmail("user-1234@nyx.local")).toBe(true);
    expect(isPlaceholderEmail("Kai@NYX.LOCAL")).toBe(true);
  });
  it("keeps real addresses, including look-alikes", () => {
    expect(isPlaceholderEmail("kai@gmail.com")).toBe(false);
    expect(isPlaceholderEmail("kai@nyx.local.example.com")).toBe(false);
  });
});
