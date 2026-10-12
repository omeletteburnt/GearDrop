# Current status (2026-10-12)

Chat, encryption, offers/counteroffers, mutual confirmation, PayNow phone/uploaded QR, media, blocking and reviews are implemented. This original proposal is retained as history. The implementation uses uploaded QR images or PayNow phone details, rather than the proposed QR generator. Verification and follow-up work are recorded in `../geardrop-completion/`.

# GearDrop Chat — Build Plan

End-to-end encrypted buyer↔seller chat, seller-made price offers, and PayNow payment via QR.
App code lives in `2026-09-14/hel/work/GearDrop/`. Status markers: `[ ]` todo · `[~]` in progress · `[x]` done.

## Decisions (2026-10-07)

| Topic | Decision |
|---|---|
| Encryption | **End-to-end.** Supabase (and the admin) only ever store ciphertext for message content. |
| Offers | **Seller only** proposes a price; buyer accepts or declines. |
| Payment | **PayNow only**, paid directly buyer → seller in their banking app. GearDrop never touches money. No Stripe, no server code. |
| PayNow QR | **Both**: generated in-browser from the seller's PayNow mobile/UEN with amount + reference locked in (default), or upload of the seller's bank QR image (fallback). |
| Demo listings | "Message seller" disabled ("Demo listing — no real seller"). Only real Supabase listings can be messaged. |
| Live updates | Supabase Realtime, with re-fetch on reconnect so nothing is missed. |

## How the encryption works

- **Keys:** each user gets an ECDH P-256 key pair generated in the browser (Web Crypto API, no extra libraries). Public key → `public_keys` table (readable by signed-in users). Private key → IndexedDB as a non-extractable `CryptoKey`.
- **Per-conversation key:** ECDH(my private, their public) → HKDF-SHA256 (info = conversation id) → AES-256-GCM key. Both sides derive the same key; it never leaves the browser.
- **Per message:** random 96-bit IV; AES-GCM with additional authenticated data = `conversation_id|sender_id`, so a ciphertext can't be replayed into another conversation or re-attributed to another sender.
- **Everything meaningful is inside the ciphertext**, including the message *type* (text / offer / offer response / PayNow QR / image), offer amounts, and PayNow details.
- **Backup for new devices:** private key is wrapped with a key derived from the user's password (PBKDF2-SHA256, 600k iterations, random salt) and stored in `key_backups` (owner-only). Signing in on a new device unwraps it.
- **Users who are already signed in** (session restored, no password typed) and have no local key are asked to re-enter their password once to unlock chat.

**Known limits (documented, accepted):**
- Metadata is *not* hidden: Supabase can see who talks to whom, about which listing, and when. Only content is encrypted.
- If a password is ever reset (no reset flow exists yet), the backup can't be unwrapped → old messages become unreadable. Any future reset flow must warn about this.
- Abuse reports can only contain what the reporter chooses to share; they're not cryptographically provable.
- Browser-based E2EE trusts the code served by Vercel — a compromised deploy could ship bad code. Same trust model as WhatsApp Web.

## Database (new file: `supabase-chat-setup.sql`, run once in SQL Editor)

- `public_keys (user_id pk → profiles, public_key jsonb, created_at)` — select: authenticated; insert/update: own row.
- `key_backups (user_id pk, wrapped_key text, salt text, iv text)` — all ops: own row only.
- `conversations (id, listing_id → listings, buyer_id, seller_id, created_at, last_message_at)` — `unique(listing_id, buyer_id)`, `check (buyer_id <> seller_id)`. Insert only as buyer, and `seller_id` must equal the listing's `owner_id` (enforced by trigger, not trusted from client). Select: participants only. No update/delete from clients.
- `messages (id, conversation_id, sender_id default auth.uid(), ciphertext text, iv text, created_at)` — insert: sender = `auth.uid()` and is a participant and not blocked; select: participants; **no update/delete policies** (messages are immutable). Ciphertext length cap.
- Rate limit trigger: reject if sender has sent > 20 messages in the last 60 s.
- `blocks (blocker_id, blocked_id)` — own rows only; message insert checks it both ways.
- `conversation_reads (user_id, conversation_id, last_read_at)` — own rows only; drives unread badges.
- Add `messages` to the `supabase_realtime` publication (RLS still applies to Realtime).

## Offers & PayNow flow

1. Buyer opens a real listing → **Message seller** → conversation created (or reopened).
2. Seller sends an **Offer** card (amount). Buyer taps **Accept** / **Decline**. A newer offer supersedes older ones.
3. After acceptance, seller taps **Send PayNow QR**:
   - *Generate*: enter PayNow mobile or UEN → browser builds an SGQR/EMVCo PayNow payload (amount, reference `GearDrop #<listing>`, amount not editable) + CRC16 → rendered with the `qrcode` package.
   - *Upload*: pick an image → resized/compressed in-browser → encrypted inside the message.
   - Seller's PayNow ID is never stored in plain text anywhere — only inside the encrypted message.
4. Buyer scans with their bank app; UI reminds them to check the recipient name and amount before confirming.
5. Seller marks listing **Reserved** / **Sold** (existing owner-update policy).

## Config changes

- `vercel.json` CSP: add `wss://vtulwvjjvgbrgxqzeemi.supabase.co` to `connect-src` (Realtime) and `blob:` to `img-src` (QR/image display).
- New dependency: `qrcode` (+ `@types/qrcode`).

## Phases

- [ ] **1. Database** — write `supabase-chat-setup.sql`; user runs it; verify policies with anon/test-user probes.
- [ ] **2. Crypto module** — `src/crypto.ts` (key gen, wrap/unwrap, derive, encrypt/decrypt) + unit tests (round-trip, wrong key fails, AAD mismatch fails, tampered ciphertext fails).
- [ ] **3. Key lifecycle** — create keys on sign-up / first sign-in, backup + restore, "re-enter password to unlock chat" prompt, clear local key on logout.
- [ ] **4. Chat data layer** — `src/chat.ts`: start/list conversations, send/load messages, Realtime subscription with reconnect catch-up, retry on failed send.
- [ ] **5. Chat UI** — wire "Message seller" (disabled for demo + own listings), Messages inbox in nav, conversation window (existing modal style, focus trap, ESC), unread badges.
- [ ] **6. Offers + PayNow** — offer / accept / decline cards; PayNow generator (`src/paynow.ts` + unit test against a known-good payload) and image upload; mark Reserved/Sold.
- [ ] **7. Safety** — block user; Privacy & Safety page: PayNow tips, what E2EE does/doesn't protect; CSP update.
- [ ] **8. Tests & verification** — RLS integration tests (outsider can't read/insert, sender can't be spoofed, messages can't be edited/deleted, rate limit, blocks), E2E happy path (two users chat → offer → QR shown), axe a11y on new screens, `pnpm build` + full `pnpm test` green. Visual check in browser.

Commit/push only with explicit user approval (push to `main` auto-deploys).
