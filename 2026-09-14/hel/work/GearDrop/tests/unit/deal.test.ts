import { describe, expect, it } from "vitest";
import { deriveDeal, isPayload, normalisePayNowPhone, validOfferAmount, type DealMessage, type Payload } from "../../src/deal";

const S = "seller", B = "buyer";
const m = (senderId: string, payload: Payload): DealMessage => ({ senderId, payload });
const offer = (by: string, offerId: string, amount: number) => m(by, { t: "offer", offerId, amount });

describe("deriveDeal (negotiation rules)", () => {
  it("buyer cannot make the first offer", () => {
    const d = deriveDeal([offer(B, "o1", 50)], S, B);
    expect(d.current).toBeNull();
  });

  it("seller offers, buyer counters, seller accepts the counter, both confirm", () => {
    const d = deriveDeal([
      offer(S, "o1", 80), offer(B, "o2", 65),
      m(B, { t: "accept", offerId: "o2" }), m(S, { t: "accept", offerId: "o2" }),
      m(B, { t: "confirm", offerId: "o2" }), m(S, { t: "confirm", offerId: "o2" }),
    ], S, B);
    expect(d.offerStatus).toEqual({ o1: "superseded", o2: "agreed" });
    expect(d.agreed).toBe(true);
    expect(d.current?.amount).toBe(65);
  });

  it("both sides must accept — one acceptance (even twice) is not enough", () => {
    const one = deriveDeal([offer(S, "o1", 80), m(S, { t: "accept", offerId: "o1" }), m(S, { t: "accept", offerId: "o1" })], S, B);
    expect(one.accepted).toBe(false);
    expect(one.acceptedBy).toEqual([S]);
    const both = deriveDeal([offer(S, "o1", 80), m(S, { t: "accept", offerId: "o1" }), m(B, { t: "accept", offerId: "o1" })], S, B);
    expect(both.accepted).toBe(true);
  });

  it("accepting an old (superseded) offer does nothing", () => {
    const d = deriveDeal([offer(S, "o1", 80), offer(B, "o2", 60), m(B, { t: "accept", offerId: "o1" })], S, B);
    expect(d.accepted).toBe(false);
  });

  it("one confirmation is not enough, and confirming before acceptance is ignored", () => {
    const early = deriveDeal([offer(S, "o1", 80), m(B, { t: "accept", offerId: "o1" }), m(B, { t: "confirm", offerId: "o1" })], S, B);
    expect(early.confirmedBy).toEqual([]);
    const one = deriveDeal([offer(S, "o1", 80), m(S, { t: "accept", offerId: "o1" }), m(B, { t: "accept", offerId: "o1" }), m(B, { t: "confirm", offerId: "o1" }), m(B, { t: "confirm", offerId: "o1" })], S, B);
    expect(one.agreed).toBe(false);
    expect(one.confirmedBy).toEqual([B]);
  });

  it("a new offer resets acceptance and confirmations", () => {
    const d = deriveDeal([offer(S, "o1", 80), m(S, { t: "accept", offerId: "o1" }), m(B, { t: "accept", offerId: "o1" }), m(B, { t: "confirm", offerId: "o1" }), offer(S, "o2", 75)], S, B);
    expect(d.accepted).toBe(false);
    expect(d.acceptedBy).toEqual([]);
    expect(d.confirmedBy).toEqual([]);
    expect(d.current?.offerId).toBe("o2");
  });

  it("no new offers after the deal is agreed; only the seller can send payment", () => {
    const agreed = [offer(S, "o1", 80), m(S, { t: "accept", offerId: "o1" }), m(B, { t: "accept", offerId: "o1" }), m(S, { t: "confirm", offerId: "o1" }), m(B, { t: "confirm", offerId: "o1" })];
    const d = deriveDeal([...agreed, offer(B, "o2", 10), m(B, { t: "payment", offerId: "o1", method: "phone", phone: "+65 9999 9999" })], S, B);
    expect(d.current?.amount).toBe(80);
    expect(d.payment).toBeNull();
    const paid = deriveDeal([...agreed, m(S, { t: "payment", offerId: "o1", method: "phone", phone: "+65 9123 4567" })], S, B);
    expect(paid.payment).toMatchObject({ method: "phone", phone: "+65 9123 4567" });
  });

  it("payment details are ignored before the deal is agreed", () => {
    const d = deriveDeal([offer(S, "o1", 80), m(S, { t: "payment", offerId: "o1", method: "phone", phone: "+65 9123 4567" })], S, B);
    expect(d.payment).toBeNull();
  });

  it("ignores messages from anyone outside the conversation", () => {
    const d = deriveDeal([offer("stranger", "o1", 1)], S, B);
    expect(d.current).toBeNull();
  });
});

describe("validOfferAmount", () => {
  it("accepts normal prices including cents", () => {
    expect(validOfferAmount(70)).toBe(true);
    expect(validOfferAmount(19.99)).toBe(true);
  });
  it("rejects zero, negative, too large, fractions of a cent and NaN", () => {
    for (const n of [0, -5, 100_001, 1.234, NaN, Infinity]) expect(validOfferAmount(n)).toBe(false);
  });
});

describe("normalisePayNowPhone", () => {
  it("accepts Singapore mobile numbers in common formats", () => {
    expect(normalisePayNowPhone("91234567")).toBe("+65 9123 4567");
    expect(normalisePayNowPhone("+65 8123-4567")).toBe("+65 8123 4567");
    expect(normalisePayNowPhone("6591234567")).toBe("+65 9123 4567");
  });
  it("rejects landlines, short numbers and junk", () => {
    for (const s of ["61234567", "9123456", "912345678", "abcdefgh", ""]) expect(normalisePayNowPhone(s)).toBeNull();
  });
});

describe("isPayload", () => {
  it("accepts known shapes and rejects unknown ones", () => {
    expect(isPayload({ t: "text", body: "hi" })).toBe(true);
    expect(isPayload({ t: "payment", offerId: "o", method: "qr", path: "c/x", mime: "image/jpeg" })).toBe(true);
    expect(isPayload({ t: "text" })).toBe(false);
    expect(isPayload({ t: "payment", offerId: "o", method: "bank" })).toBe(false);
    expect(isPayload(null)).toBe(false);
  });
  it("refuses media and QR types the browser could run as a page", () => {
    for (const mime of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", "application/pdf"]) {
      expect(isPayload({ t: "media", kind: "image", path: "c/x", mime, size: 1 })).toBe(false);
      expect(isPayload({ t: "media", kind: "video", path: "c/x", mime, size: 1 })).toBe(false);
      expect(isPayload({ t: "payment", offerId: "o", method: "qr", path: "c/x", mime })).toBe(false);
    }
    expect(isPayload({ t: "media", kind: "video", path: "c/x", mime: "video/mp4", size: 1 })).toBe(true);
    expect(isPayload({ t: "media", kind: "image", path: "c/x", mime: "video/mp4", size: 1 })).toBe(false);
  });
  it("only accepts PayNow numbers in the normalised format", () => {
    expect(isPayload({ t: "payment", offerId: "o", method: "phone", phone: "+65 9123 4567" })).toBe(true);
    expect(isPayload({ t: "payment", offerId: "o", method: "phone", phone: "click http://evil.example" })).toBe(false);
  });
});
