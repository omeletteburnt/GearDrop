import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Session } from "./supabase";
import { blockedByMe, conversationKey, deliverHeld, hasChatKey, holdMessage, incomingHeldCount, loadHeld, type HeldMessage, isUnread, listConversations, loadMessages, loadReads, markRead, mediaUrl, prepareMedia, sendPayload, setBlocked, subscribeInbox, subscribeMessages, unlockChat, uploadMedia, type ChatMessage, type Conversation } from "./chat";
import { CONFIRM_DELAY_MS, deriveDeal, normalisePayNowPhone, validOfferAmount, type Deal, type Payload } from "./deal";
import { safeImageUrl } from "./validation";
import { overlayClick, useModalA11y } from "./modal";
import { recordDealStep } from "./reviews";
import { ReviewBar } from "./ReviewsUI";

const MAX_TEXT = 2000;
const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const otherName = (c: Conversation, myId: string) => (myId === c.buyer_id ? c.seller?.username : c.buyer?.username) ?? "User";

// useModalA11y re-runs (and re-focuses the first button) whenever onClose
// changes identity; chat re-renders on every message, so pin it.
function useStable(fn: () => void) {
  const ref = useRef(fn); ref.current = fn;
  return useCallback(() => ref.current(), []);
}

// Unread-conversation count for the nav badge, kept live via Realtime.
export function useUnread(session: Session | null): [number, () => void] {
  const [count, setCount] = useState(0);
  const myId = session?.user.id;
  const refresh = useCallback(() => {
    if (!myId) { setCount(0); return; }
    Promise.all([listConversations(), loadReads()]).then(([convs, reads]) => setCount(convs.filter(c => isUnread(c, myId, reads)).length)).catch(() => undefined);
  }, [myId]);
  useEffect(() => { if (!myId) { setCount(0); return; } return subscribeInbox(refresh); }, [myId, refresh]);
  return [count, refresh];
}

export function Inbox({ session, close, open }: { session: Session; close: () => void; open: (c: Conversation) => void }) {
  const [convs, setConvs] = useState<Conversation[] | null>(null);
  const [reads, setReads] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const myId = session.user.id;
  useEffect(() => {
    const load = () => Promise.all([listConversations(), loadReads()]).then(([c, r]) => { setConvs(c); setReads(r); }).catch(e => setError(e.message));
    return subscribeInbox(load);
  }, []);
  const stableClose = useStable(close);
  const ref = useRef<HTMLDivElement>(null); useModalA11y(ref, stableClose);
  return <div className="overlay" onMouseDown={overlayClick(stableClose)}><div className="sell-form inbox" ref={ref} role="dialog" aria-modal="true" aria-label="Messages">
    <button className="close" onClick={stableClose} aria-label="Close">×</button>
    <p className="eyebrow">MESSAGES 🔒</p><h2>Your conversations</h2>
    <p className="muted">End-to-end encrypted. Only you and the other person can read them.</p>
    {error && <p className="field-error" role="alert">{error}</p>}
    {!convs && !error && <p className="muted">Loading…</p>}
    {convs?.length === 0 && <div className="compare-empty">No conversations yet. Open a listing and tap “Message seller”.</div>}
    <ul className="inbox-list">{convs?.map(c => {
      const unread = isUnread(c, myId, reads);
      return <li key={c.id}><button onClick={() => open(c)} aria-label={`${c.listing?.name ?? "Listing"} with ${otherName(c, myId)}${unread ? ", unread" : ""}`}>
        <img src={safeImageUrl(c.listing?.image ?? "")} alt="" />
        <span><b>{c.listing?.name ?? "Removed listing"}</b><small>{myId === c.seller_id ? "Buyer" : "Seller"}: {otherName(c, myId)}</small></span>
        {unread && <i className="unread-dot" aria-hidden="true" />}
        <small>{c.last_message_at ? new Date(c.last_message_at).toLocaleDateString() : "New"}</small>
      </button></li>;
    })}</ul>
  </div></div>;
}

type KeyState = "loading" | "locked" | "no-peer" | "ready";

export function ChatWindow({ session, conv, close, onRead }: { session: Session; conv: Conversation; close: () => void; onRead: () => void }) {
  const myId = session.user.id;
  const isSeller = myId === conv.seller_id;
  const otherId = isSeller ? conv.buyer_id : conv.seller_id;
  const name = otherName(conv, myId);
  const [keyState, setKeyState] = useState<KeyState>("loading");
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState("");
  const [blocked, setBlockedState] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [incomingHeld, setIncomingHeld] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!(await hasChatKey(myId))) { if (!cancelled) setKeyState("locked"); return; }
      const k = await conversationKey(conv, myId);
      if (cancelled) return;
      if (!k) { setKeyState("no-peer"); return; }
      // Deliver anything you wrote while they had no key, before loading.
      await deliverHeld(myId).catch(() => 0);
      if (cancelled) return;
      setKey(k); setKeyState("ready");
      incomingHeldCount(conv.id).then(n => !cancelled && setIncomingHeld(n));
    })().catch(() => !cancelled && setError("Could not open secure chat."));
    blockedByMe().then(ids => !cancelled && setBlockedState(ids.includes(otherId)));
    return () => { cancelled = true; };
  }, [conv, myId, otherId, attempt]);

  const merge = useCallback((incoming: ChatMessage[]) => setMessages(old => {
    const seen = new Set(old.map(m => m.id));
    const added = incoming.filter(m => !seen.has(m.id));
    return added.length ? [...old, ...added].sort((a, b) => a.id - b.id) : old;
  }), []);

  const lastId = useRef(0);
  useEffect(() => { lastId.current = messages.at(-1)?.id ?? 0; }, [messages]);

  useEffect(() => {
    if (!key) return;
    return subscribeMessages(conv.id, key, m => {
      merge([m]);
      // The other side just sent payment details: open the payment panel for the buyer.
      if (m.payload?.t === "payment" && m.senderId !== myId) setPaymentOpen(true);
    }, () => loadMessages(conv.id, key, lastId.current).then(merge).then(() => setLoaded(true)).catch(e => setError(e.message)));
  }, [conv.id, key, merge, myId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    const last = messages.at(-1);
    if (last) markRead(conv, myId, last.createdAt).then(onRead);
  }, [messages, conv, myId, onRead]);

  const deal = useMemo(() => deriveDeal(messages.flatMap(m => m.payload ? [{ senderId: m.senderId, payload: m.payload }] : []), conv.seller_id, conv.buyer_id), [messages, conv]);

  // Self-heal: re-record your own deal steps (idempotent) in case an earlier
  // call failed, e.g. the tab closed mid-way.
  const myConfirmed = deal.agreed && deal.confirmedBy.includes(myId);
  const paymentSent = Boolean(deal.payment);
  useEffect(() => {
    if (!myConfirmed) return;
    recordDealStep(conv.id, "confirm").then(() => isSeller && paymentSent ? recordDealStep(conv.id, "payment") : undefined).catch(() => undefined);
  }, [myConfirmed, paymentSent, isSeller, conv.id]);

  const send = useCallback(async (payload: Payload) => {
    if (!key) return;
    setError("");
    try {
      // The server is told about the confirmation BEFORE the other side can
      // see it, so a payment sent right after always finds both confirmations.
      if (payload.t === "confirm") await recordDealStep(conv.id, "confirm");
      await sendPayload(conv.id, key, myId, payload);
      if (payload.t === "payment") await recordDealStep(conv.id, "payment");
    }
    catch (e) { setError(e instanceof Error ? e.message : "Message failed to send."); throw e; }
    // Don't rely on Realtime alone to show your own message.
    loadMessages(conv.id, key, lastId.current).then(merge).catch(() => undefined);
  }, [conv.id, key, myId, merge]);

  async function toggleBlock() {
    if (!blocked && !window.confirm(`Block ${name}? Neither of you will be able to send messages in this chat until you unblock them.`)) return;
    try { await setBlocked(myId, otherId, !blocked); setBlockedState(!blocked); } catch (e) { setError(e instanceof Error ? e.message : "Could not update block."); }
  }

  const stableClose = useStable(close);
  const ref = useRef<HTMLDivElement>(null); useModalA11y(ref, stableClose);
  const showPayment = Boolean(paymentOpen && deal.agreed && key);

  return <div className="overlay" onMouseDown={overlayClick(stableClose)}><div className={`chat-window${showPayment ? " with-payment" : ""}`} ref={ref} role="dialog" aria-modal="true" aria-label={`Chat with ${name} about ${conv.listing?.name ?? "a listing"}`}>
    {paymentOpen && deal.agreed && key && <PaymentPanel conv={conv} chatKey={key} deal={deal} isSeller={isSeller} send={send} close={() => setPaymentOpen(false)} />}
    <section className="chat-main">
      <header className="chat-head">
        <img src={safeImageUrl(conv.listing?.image ?? "")} alt="" />
        <div><b>{conv.listing?.name ?? "Removed listing"}</b><small>{isSeller ? "Buyer" : "Seller"}: {name} · 🔒 End-to-end encrypted</small></div>
        <button className="btn ghost block-btn" onClick={toggleBlock}>{blocked ? "Unblock" : "Block"}</button>
        <button className="close" onClick={stableClose} aria-label="Close">×</button>
      </header>
      {keyState === "loading" && <p className="chat-notice">Opening secure chat…</p>}
      {keyState === "locked" && <Unlock session={session} done={() => setAttempt(a => a + 1)} />}
      {keyState === "no-peer" && <HeldChat convId={conv.id} myId={myId} name={name} blocked={blocked} />}
      {keyState === "ready" && key && <>
        <div className="chat-messages" ref={listRef} aria-live="polite">
          {incomingHeld > 0 && <p className="chat-notice">{name} sent you {incomingHeld === 1 ? "a message" : `${incomingHeld} messages`} before your secure chat was set up. {incomingHeld === 1 ? "It" : "They"}’ll appear here automatically the next time {name} opens GearDrop.</p>}
          {messages.length === 0 && loaded && <p className="chat-notice">Say hello 👋 {isSeller ? "You can send an offer below once you’ve agreed on the details." : `Ask ${name} anything about the listing.`}</p>}
          {messages.map(m => <Bubble key={m.id} m={m} mine={m.senderId === myId} senderName={m.senderId === myId ? "You" : name} conv={conv} chatKey={key} deal={deal} myId={myId} send={send} openPayment={() => setPaymentOpen(true)} />)}
        </div>
        {deal.agreed && <ReviewBar convId={conv.id} myId={myId} isSeller={isSeller} otherName={name} paymentSent={paymentSent} />}
        <DealBar deal={deal} isSeller={isSeller} myId={myId} send={send} openPayment={() => setPaymentOpen(true)} disabled={blocked} />
        {blocked ? <p className="chat-notice">You blocked {name}. Unblock them to send messages.</p> : <Composer conv={conv} chatKey={key} myId={myId} send={send} setError={setError} />}
      </>}
      {error && <p className="field-error chat-error" role="alert">{error}</p>}
    </section>
  </div></div>;
}

// Shown while the other person has no chat key yet: text can still be sent,
// it is held (encrypted for you only) and delivered once they've signed in.
function HeldChat({ convId, myId, name, blocked }: { convId: string; myId: string; name: string; blocked: boolean }) {
  const [held, setHeld] = useState<HeldMessage[]>([]);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const reload = useCallback(() => loadHeld(convId, myId).then(setHeld).catch(() => undefined), [convId, myId]);
  useEffect(() => { reload(); }, [reload]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true); setError("");
    try { await holdMessage(convId, myId, body); setText(""); await reload(); }
    catch (err) { setError(err instanceof Error ? err.message : "Message failed to send."); }
    finally { setBusy(false); }
  }
  return <>
    <div className="chat-messages" aria-live="polite">
      <p className="chat-notice">{name} hasn’t set up secure chat yet. You can still send text messages: they’re kept encrypted and delivered automatically once {name} signs in. Photos, videos and offers unlock after that.</p>
      {held.map(h => <div className="bubble mine held" key={h.id}><p>{h.body ?? "🔒 This message can’t be read on this device."}</p><small>⏳ Waiting to deliver · {time(h.createdAt)}</small></div>)}
    </div>
    {blocked ? <p className="chat-notice">You blocked {name}. Unblock them to send messages.</p> : <form className="composer text-only" onSubmit={submit}>
      <input value={text} onChange={e => setText(e.target.value)} maxLength={MAX_TEXT} placeholder="Type a message…" aria-label="Message" disabled={busy} />
      <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
    </form>}
    {error && <p className="field-error chat-error" role="alert">{error}</p>}
  </>;
}

function Unlock({ session, done }: { session: Session; done: () => void }) {
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await unlockChat(session.user.email ?? "", session.user.id, password); done(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not unlock chat."); }
    finally { setBusy(false); }
  }
  return <form className="chat-unlock" onSubmit={submit}>
    <b>Unlock secure chat</b>
    <p className="muted">Your messages are encrypted with a key protected by your password. Enter it once to unlock chat on this device.</p>
    <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" /></label>
    {error && <p className="field-error" role="alert">{error}</p>}
    <button className="btn primary" disabled={busy || !password}>{busy ? "Unlocking…" : "Unlock chat"}</button>
  </form>;
}

function Bubble({ m, mine, senderName, conv, chatKey, deal, myId, send, openPayment }: { m: ChatMessage; mine: boolean; senderName: string; conv: Conversation; chatKey: CryptoKey; deal: Deal; myId: string; send: (p: Payload) => Promise<void>; openPayment: () => void }) {
  const p = m.payload;
  const cls = `bubble${mine ? " mine" : ""}`;
  if (!p) return <div className={cls}><p className="muted">🔒 This message can’t be read on this device.</p><small>{time(m.createdAt)}</small></div>;
  if (p.t === "text") return <div className={cls}><p>{p.body}</p><small>{time(m.createdAt)}</small></div>;
  if (p.t === "media") return <div className={`${cls} media`}><Media conv={conv} chatKey={chatKey} senderId={m.senderId} path={p.path} mime={p.mime} kind={p.kind} /><small>{time(m.createdAt)}</small></div>;
  if (p.t === "offer") {
    const status = deal.offerStatus[p.offerId];
    if (!status) return null; // offer that broke the rules (see deriveDeal)
    const isCurrent = deal.current?.offerId === p.offerId;
    const canAccept = status === "open" && isCurrent && !deal.acceptedBy.includes(myId);
    const waiting = !isCurrent ? "" : deal.acceptedBy.length === 0 ? "Waiting for both sides to accept" : canAccept ? "The other side accepted — your turn" : "You accepted — waiting for the other side";
    return <div className={`offer-card ${status}${mine ? " mine" : ""}`}>
      <small>{senderName} {m.senderId === conv.seller_id ? "offered" : "countered"}</small>
      <span className="offer-price">{money(p.amount)}</span>
      <small className="offer-status">{status === "open" ? waiting : status === "accepted" ? "Accepted — both sides confirm below" : status === "agreed" ? "✓ Deal agreed" : "Replaced by a newer offer"}</small>
      {canAccept && <button className="btn primary" onClick={() => send({ t: "accept", offerId: p.offerId }).catch(() => undefined)}>Accept {money(p.amount)}</button>}
      <small>{time(m.createdAt)}</small>
    </div>;
  }
  if (p.t === "accept" || p.t === "confirm") {
    if (p.offerId !== deal.current?.offerId) return null;
    return <p className="chat-event">{senderName} {p.t === "accept" ? "accepted the offer" : "confirmed the deal"} · {time(m.createdAt)}</p>;
  }
  if (p.t === "payment") {
    if (deal.payment !== p) return <p className="chat-event">Earlier payment details (replaced) · {time(m.createdAt)}</p>;
    return <div className={`offer-card agreed${mine ? " mine" : ""}`}>
      <small>{mine ? "You sent payment details" : `${senderName} sent PayNow payment details`}</small>
      <button className="btn primary" onClick={openPayment}>Open payment</button>
      <small>{time(m.createdAt)}</small>
    </div>;
  }
  return null;
}

function Media({ conv, chatKey, senderId, path, mime, kind, alt = "Photo sent in chat" }: { conv: Conversation; chatKey: CryptoKey; senderId: string; path: string; mime: string; kind: "image" | "video"; alt?: string }) {
  const [url, setUrl] = useState(""); const [failed, setFailed] = useState(false);
  useEffect(() => { let live = true; mediaUrl(conv.id, chatKey, senderId, path, mime).then(u => live && setUrl(u), () => live && setFailed(true)); return () => { live = false; }; }, [conv.id, chatKey, senderId, path, mime]);
  if (failed) return <p className="muted">Couldn’t load this file.</p>;
  if (!url) return <div className="media-loading" aria-label="Loading media" />;
  return kind === "image" ? <img src={url} alt={alt} /> : <video src={url} controls preload="metadata" />;
}

function DealBar({ deal, isSeller, myId, send, openPayment, disabled }: { deal: Deal; isSeller: boolean; myId: string; send: (p: Payload) => Promise<void>; openPayment: () => void; disabled: boolean }) {
  const [amount, setAmount] = useState(""); const [busy, setBusy] = useState(false);
  const [unlockAt, setUnlockAt] = useState(0); const [now, setNow] = useState(Date.now());
  const current = deal.current;
  // Countdown before "Confirm deal" unlocks; restarts for each newly accepted offer.
  useEffect(() => { if (deal.accepted && !deal.agreed) setUnlockAt(Date.now() + CONFIRM_DELAY_MS); }, [deal.accepted, deal.agreed, current?.offerId]);
  useEffect(() => {
    if (Date.now() >= unlockAt) return;
    const id = setInterval(() => { setNow(Date.now()); if (Date.now() >= unlockAt) clearInterval(id); }, 250);
    return () => clearInterval(id);
  }, [unlockAt]);
  if (disabled) return null;

  if (deal.agreed && current) return <div className="deal-bar agreed">
    <span>✓ Deal agreed at <b>{money(current.amount)}</b></span>
    {isSeller ? <button className="btn primary" onClick={openPayment}>{deal.payment ? "Open payment" : "Proceed to payment"}</button>
      : deal.payment ? <button className="btn primary" onClick={openPayment}>Open payment</button> : <small>Waiting for the seller to send PayNow details.</small>}
  </div>;

  if (deal.accepted && current) {
    const mineConfirmed = deal.confirmedBy.includes(myId);
    const wait = Math.max(0, Math.ceil((unlockAt - now) / 1000));
    return <div className="deal-bar">
      <span>Both sides must confirm <b>{money(current.amount)}</b></span>
      {mineConfirmed ? <small>You confirmed. Waiting for the other side…</small>
        : <button className="btn primary" disabled={wait > 0 || busy} onClick={() => { setBusy(true); send({ t: "confirm", offerId: current.offerId }).catch(() => undefined).finally(() => setBusy(false)); }}>{wait > 0 ? `Confirm deal (${wait})` : "Confirm deal"}</button>}
    </div>;
  }

  if (!isSeller && !current) return null; // the seller makes the first offer
  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!validOfferAmount(n)) return;
    setBusy(true);
    try { await send({ t: "offer", offerId: crypto.randomUUID(), amount: n }); setAmount(""); } catch { /* error shown by send */ }
    finally { setBusy(false); }
  }
  const label = current ? "Counter-offer" : "Send offer";
  return <form className="deal-bar" onSubmit={submit}>
    <label>{current ? `Current offer ${money(current.amount)} — suggest a different price` : "Offer a price to the buyer"}
      <span className="offer-input"><span aria-hidden="true">$</span><input type="number" min="1" step="0.01" max="100000" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder={current ? String(current.amount) : "Price"} /></span>
    </label>
    <button className="btn secondary" disabled={busy || !validOfferAmount(Number(amount))}>{label}</button>
  </form>;
}

function Composer({ conv, chatKey, myId, send, setError }: { conv: Conversation; chatKey: CryptoKey; myId: string; send: (p: Payload) => Promise<void>; setError: (s: string) => void }) {
  const [text, setText] = useState(""); const [busy, setBusy] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy("Sending…");
    try { await send({ t: "text", body }); setText(""); } catch { /* error shown by send */ }
    finally { setBusy(""); }
  }
  async function attach(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError(""); setBusy(file.type.startsWith("video/") ? "Encrypting video…" : "Encrypting photo…");
    try {
      const media = await prepareMedia(file);
      const path = await uploadMedia(conv.id, chatKey, myId, media.blob);
      await send({ t: "media", kind: media.kind, path, mime: media.mime, size: media.blob.size });
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setBusy(""); }
  }
  return <form className="composer" onSubmit={submit}>
    <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" hidden onChange={e => attach(e.target.files?.[0])} />
    <button type="button" className="btn ghost attach" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)} aria-label="Attach photo or video">📎</button>
    <input value={text} onChange={e => setText(e.target.value)} maxLength={MAX_TEXT} placeholder={busy || "Type a message…"} aria-label="Message" disabled={Boolean(busy)} />
    <button className="btn primary" disabled={Boolean(busy) || !text.trim()}>Send</button>
  </form>;
}

function PaymentPanel({ conv, chatKey, deal, isSeller, send, close }: { conv: Conversation; chatKey: CryptoKey; deal: Deal; isSeller: boolean; send: (p: Payload) => Promise<void>; close: () => void }) {
  const current = deal.current!;
  const payment = deal.payment;
  const reference = `GearDrop #${conv.listing_id}`;
  const [editing, setEditing] = useState(!payment);
  const [method, setMethod] = useState<"qr" | "phone">("qr");
  const [phone, setPhone] = useState(""); const [file, setFile] = useState<File | null>(null);
  const qrInput = useRef<HTMLInputElement>(null);
  const [qrPreview, setQrPreview] = useState("");
  useEffect(() => { if (!file) { setQrPreview(""); return; } const u = URL.createObjectURL(file); setQrPreview(u); return () => URL.revokeObjectURL(u); }, [file]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [copied, setCopied] = useState("");
  useEffect(() => { if (payment) setEditing(false); }, [payment]);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError("");
    try {
      setBusy(true);
      if (method === "phone") {
        const normalised = normalisePayNowPhone(phone);
        if (!normalised) throw new Error("Enter a Singapore mobile number, e.g. 9123 4567.");
        await send({ t: "payment", offerId: current.offerId, method: "phone", phone: normalised });
      } else {
        if (!file || !file.type.startsWith("image/")) throw new Error("Choose your PayNow QR image.");
        const media = await prepareMedia(file);
        const path = await uploadMedia(conv.id, chatKey, conv.seller_id, media.blob);
        await send({ t: "payment", offerId: current.offerId, method: "qr", path, mime: media.mime });
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send payment details."); }
    finally { setBusy(false); }
  }
  function copy(value: string, what: string) { navigator.clipboard?.writeText(value).then(() => { setCopied(what); setTimeout(() => setCopied(""), 2000); }); }

  return <aside className="payment-panel" aria-label="Payment">
    <div className="payment-head"><p className="eyebrow">PAYNOW PAYMENT</p><button className="btn ghost" onClick={close}>Hide</button></div>
    <dl className="payment-summary">
      <div><dt>Amount</dt><dd>{money(current.amount)}</dd></div>
      <div><dt>Reference</dt><dd>{reference} <button type="button" className="example" onClick={() => copy(reference, "reference")}>{copied === "reference" ? "Copied" : "Copy"}</button></dd></div>
    </dl>
    {payment && !editing && <div className="payment-details">
      {payment.method === "qr" ? <><b>Scan with your banking app</b><Media conv={conv} chatKey={chatKey} senderId={conv.seller_id} path={payment.path} mime={payment.mime} kind="image" alt="Seller's PayNow QR code" /></>
        : <><b>PayNow to mobile number</b><p className="payment-phone">{payment.phone} <button type="button" className="example" onClick={() => copy(payment.phone.replace(/\s/g, ""), "phone")}>{copied === "phone" ? "Copied" : "Copy"}</button></p></>}
      {isSeller && <button className="btn secondary" onClick={() => setEditing(true)}>Change payment details</button>}
    </div>}
    {isSeller && editing && <form className="payment-form" onSubmit={submit}>
      <b>How should the buyer pay you?</b>
      <div className="method-toggle" role="radiogroup" aria-label="Payment method">
        <label className={method === "qr" ? "on" : ""}><input type="radio" name="method" checked={method === "qr"} onChange={() => setMethod("qr")} /><span className="method-icon" aria-hidden="true">▦</span><span><b>PayNow QR</b><small>From your banking app</small></span></label>
        <label className={method === "phone" ? "on" : ""}><input type="radio" name="method" checked={method === "phone"} onChange={() => setMethod("phone")} /><span className="method-icon" aria-hidden="true">📱</span><span><b>Phone number</b><small>Buyer pays your mobile</small></span></label>
      </div>
      {method === "qr" ? <div className="qr-pick">
        <input ref={qrInput} type="file" accept="image/*" hidden aria-label="Choose your PayNow QR image" onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
        {qrPreview ? <div className="qr-chosen">
          <img src={qrPreview} alt="Your PayNow QR (preview)" />
          <span><b>{file?.name}</b><small>Check it's your QR before sending.</small><button type="button" className="btn ghost" onClick={() => qrInput.current?.click()}>Change</button></span>
        </div> : <button type="button" className="qr-drop" onClick={() => qrInput.current?.click()}>
          <span className="qr-drop-icon" aria-hidden="true">▦</span><b>Choose your PayNow QR</b><small>A screenshot or saved image from your banking app</small>
        </button>}
      </div>
        : <label>PayNow mobile number<span className="phone-field"><span aria-hidden="true">+65</span><input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="9123 4567" /></span></label>}
      <p className="muted">These details are encrypted — only the buyer can see them.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send to buyer"}</button>
      {payment && <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>}
    </form>}
    {!isSeller && !payment && <p className="muted">Waiting for the seller to send PayNow details…</p>}
    <div className="payment-tips"><b>Before you pay</b><ul>
      <li>Check the <b>recipient name</b> and <b>amount ({money(current.amount)})</b> in your banking app match what you agreed.</li>
      <li>Only pay after both sides confirmed the deal here.</li>
      <li>GearDrop never asks for your bank login or OTP.</li>
    </ul></div>
  </aside>;
}
