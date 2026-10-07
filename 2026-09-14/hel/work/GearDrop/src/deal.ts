// Everything a chat message can carry. The whole object is encrypted, so the
// server never sees the message type, offer amounts or PayNow details.
export type Payload =
  | { t: "text"; body: string }
  | { t: "media"; kind: "image" | "video"; path: string; mime: string; size: number }
  | { t: "offer"; offerId: string; amount: number }
  | { t: "accept"; offerId: string }
  | { t: "confirm"; offerId: string }
  | { t: "payment"; offerId: string; method: "phone"; phone: string }
  | { t: "payment"; offerId: string; method: "qr"; path: string; mime: string };

export type DealMessage = { senderId: string; payload: Payload };
export type OfferStatus = "open" | "accepted" | "agreed" | "superseded";
export type Deal = {
  current: { offerId: string; amount: number; proposerId: string } | null;
  acceptedBy: string[];
  accepted: boolean; // true once BOTH sides accepted
  confirmedBy: string[];
  agreed: boolean;
  payment: Extract<Payload, { t: "payment" }> | null;
  offerStatus: Record<string, OfferStatus>;
};

export const MAX_OFFER = 100_000;
// The final "Confirm deal" button only unlocks after this delay, so neither
// side can lock in a price by accident.
export const CONFIRM_DELAY_MS = 5000;

export function validOfferAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_OFFER && Math.abs(Math.round(amount * 100) - amount * 100) < 1e-6;
}

// Replays the conversation in order. Rules:
// - The seller makes the first offer; after that either side can counter.
// - A newer offer replaces the old one and resets acceptance/confirmation.
// - BOTH sides must accept the current offer (the proposer too), and then
//   BOTH must confirm; then the deal is locked and only
//   the seller can send payment details for it.
// Anything that breaks these rules is ignored rather than trusted.
export function deriveDeal(messages: DealMessage[], sellerId: string, buyerId: string): Deal {
  const deal: Deal = { current: null, acceptedBy: [], accepted: false, confirmedBy: [], agreed: false, payment: null, offerStatus: {} };
  for (const { senderId, payload: p } of messages) {
    if (senderId !== sellerId && senderId !== buyerId) continue;
    if (p.t === "offer") {
      if (deal.agreed || !validOfferAmount(p.amount) || deal.offerStatus[p.offerId]) continue;
      if (!deal.current && senderId !== sellerId) continue;
      if (deal.current) deal.offerStatus[deal.current.offerId] = "superseded";
      deal.current = { offerId: p.offerId, amount: p.amount, proposerId: senderId };
      deal.acceptedBy = []; deal.accepted = false; deal.confirmedBy = [];
      deal.offerStatus[p.offerId] = "open";
    } else if (p.t === "accept") {
      if (!deal.current || p.offerId !== deal.current.offerId || deal.acceptedBy.includes(senderId)) continue;
      deal.acceptedBy.push(senderId);
      if (deal.acceptedBy.length === 2) { deal.accepted = true; deal.offerStatus[p.offerId] = "accepted"; }
    } else if (p.t === "confirm") {
      if (!deal.current || !deal.accepted || deal.agreed || p.offerId !== deal.current.offerId || deal.confirmedBy.includes(senderId)) continue;
      deal.confirmedBy.push(senderId);
      if (deal.confirmedBy.length === 2) { deal.agreed = true; deal.offerStatus[p.offerId] = "agreed"; }
    } else if (p.t === "payment") {
      if (deal.agreed && senderId === sellerId && p.offerId === deal.current?.offerId) deal.payment = p;
    }
  }
  return deal;
}

// Singapore PayNow mobile numbers: 8 digits starting with 8 or 9, with an
// optional +65 prefix. Returns "+65 9123 4567" or null if invalid.
export function normalisePayNowPhone(input: string): string | null {
  let digits = input.replace(/[\s-]/g, "");
  if (digits.startsWith("+65")) digits = digits.slice(3);
  else if (digits.startsWith("65") && digits.length === 10) digits = digits.slice(2);
  if (!/^[89]\d{7}$/.test(digits)) return null;
  return `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`;
}

// Media types a decrypted file may be shown as. The type comes from the
// sender, so anything else (e.g. text/html, image/svg+xml) is refused: a blob
// with a scriptable type could run as a page on GearDrop's origin.
export const SAFE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const SAFE_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];
const safeMime = (kind: unknown, mime: unknown) =>
  typeof mime === "string" && (kind === "video" ? SAFE_VIDEO_TYPES : SAFE_IMAGE_TYPES).includes(mime);

// Defensive shape check for decrypted payloads: a message that decrypts fine
// but has an unexpected shape (e.g. from a newer/older client) is dropped.
export function isPayload(x: unknown): x is Payload {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  const str = (k: string) => typeof p[k] === "string";
  switch (p.t) {
    case "text": return str("body");
    case "media": return (p.kind === "image" || p.kind === "video") && str("path") && safeMime(p.kind, p.mime) && typeof p.size === "number";
    case "offer": return str("offerId") && typeof p.amount === "number";
    case "accept": case "confirm": return str("offerId");
    case "payment": return str("offerId") && (p.method === "phone" ? str("phone") && /^\+65 [89]\d{3} \d{4}$/.test(p.phone as string) : p.method === "qr" && str("path") && safeMime("image", p.mime));
    default: return false;
  }
}
