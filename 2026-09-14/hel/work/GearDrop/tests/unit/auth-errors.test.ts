import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "../../src/supabase";

// Regression test for a real bug: an earlier version of friendlyAuthError
// rewrote every password-policy error to a hardcoded "must be at least 6
// characters," which was simply wrong once this project's actual Supabase
// Auth minimum (confirmed directly against the live API) turned out to be
// 12. Password-policy messages must now pass through verbatim, since only
// the server actually knows what the real policy is.
describe("friendlyAuthError", () => {
  it("passes password-policy messages through verbatim, whatever the real limit is", () => {
    expect(friendlyAuthError("Password should be at least 12 characters.")).toBe("Password should be at least 12 characters.");
    expect(friendlyAuthError("Password should be at least 8 characters.")).toBe("Password should be at least 8 characters.");
    expect(friendlyAuthError("Password is known to be weak and easy to guess.")).toBe("Password is known to be weak and easy to guess.");
  });

  it("still rewrites non-password errors that could leak account info", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("Incorrect username/email or password.");
    expect(friendlyAuthError("User already registered")).toBe("That email is already registered.");
  });

  it("falls back to a generic message for anything unrecognized", () => {
    expect(friendlyAuthError("Some completely unexpected internal error")).toBe("Something went wrong. Please try again.");
  });
});
