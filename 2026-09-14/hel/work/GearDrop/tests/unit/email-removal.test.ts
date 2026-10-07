import { describe, expect, it } from "vitest";
import { canConfirmEmailRemoval, emailLinkSignInAt, EMAIL_LINK_WINDOW_MS, type Session } from "../../src/supabase";

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const token = (amr: unknown) => `${b64url({ alg: "HS256" })}.${b64url({ sub: "u", amr })}.sig`;
const session = (amr: unknown) => ({ access_token: token(amr) }) as Session;
const now = Date.parse("2026-10-07T12:00:00Z");
const secs = (ms: number) => Math.floor(ms / 1000);

describe("email removal confirmation window", () => {
  it("reads the emailed-link sign-in time from the token", () => {
    expect(emailLinkSignInAt(token([{ method: "otp", timestamp: secs(now) }]))).toBe(secs(now) * 1000);
    expect(emailLinkSignInAt(token([{ method: "password", timestamp: secs(now) }]))).toBeNull();
    expect(emailLinkSignInAt("not-a-jwt")).toBeNull();
  });
  it("allows removal only within 10 minutes of signing in through the link", () => {
    expect(canConfirmEmailRemoval(session([{ method: "magiclink", timestamp: secs(now - 60_000) }]), now)).toBe(true);
    expect(canConfirmEmailRemoval(session([{ method: "otp", timestamp: secs(now - EMAIL_LINK_WINDOW_MS - 1000) }]), now)).toBe(false);
  });
  it("a password sign-in never counts, even right now", () => {
    expect(canConfirmEmailRemoval(session([{ method: "password", timestamp: secs(now) }]), now)).toBe(false);
  });
});
