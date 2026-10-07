import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { canConfirmEmailRemoval, getUsername, isEmailLike, isPlaceholderEmail, removeMyEmail, requestEmailChange, sendEmailRemovalLink, supabase, REMOVE_EMAIL_FLAG, type Session } from "./supabase";
import { overlayClick, useModalA11y } from "./modal";
import { ratingSummary, type Rating } from "./reviews";
import { RatingBadge, ReviewList } from "./ReviewsUI";

type Account = { username: string | null; email: string | null; pendingEmail: string | null };
const NO_RECOVERY = "Without an email you can’t recover your account if you forget your password.";

export function Settings({ session, admin, close }: { session: Session; admin: boolean; close: () => void }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [sent, setSent] = useState("");
  const [rating, setRating] = useState<Rating | null>(null);
  const [reviewTab, setReviewTab] = useState<"seller" | "buyer" | null>(null);
  const loadRating = useCallback(() => ratingSummary([session.user.id]).then(r => setRating(r[session.user.id] ?? null)).catch(() => undefined), [session.user.id]);
  useEffect(() => { loadRating(); }, [loadRating]);
  const [removal, setRemoval] = useState<"idle" | "asking" | "sent" | "removed">("idle");
  // Signed in through the emailed removal link within the last 10 minutes.
  const canRemoveNow = canConfirmEmailRemoval(session);

  // Re-fetch the user so a confirmation clicked in another tab shows up here.
  const load = useCallback(async () => {
    const [{ data }, username] = await Promise.all([supabase.auth.getUser(), getUsername(session.user.id)]);
    const user = data.user ?? session.user;
    setAccount({
      username,
      email: isPlaceholderEmail(user.email) ? null : user.email!,
      pendingEmail: user.new_email && !isPlaceholderEmail(user.new_email) ? user.new_email : null,
    });
  }, [session]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!isEmailLike(value)) { setError("Enter a valid email address."); return; }
    if (value.toLowerCase() === account?.email?.toLowerCase()) { setError("That's already your email."); return; }
    setBusy(true); setError("");
    try { await requestEmailChange(value); setSent(value.toLowerCase()); setEditing(false); setEmail(""); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update your email."); }
    finally { setBusy(false); }
  }

  async function run(action: () => Promise<void>, next: typeof removal) {
    setBusy(true); setError("");
    try { await action(); setRemoval(next); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Something went wrong."); }
    finally { setBusy(false); }
  }

  // Pinned so useModalA11y doesn't re-focus on every re-render.
  const closeRef = useRef(close); closeRef.current = close;
  const stableClose = useCallback(() => closeRef.current(), []);
  const ref = useRef<HTMLDivElement>(null); useModalA11y(ref, stableClose);

  const idle = !editing && removal !== "asking";
  return <div className="overlay" onMouseDown={overlayClick(stableClose)}><div className="sell-form settings" ref={ref} role="dialog" aria-modal="true" aria-label="Account settings">
    <button className="close" onClick={stableClose} aria-label="Close">×</button>
    <p className="eyebrow">SETTINGS</p><h2>Your account</h2>
    {!account ? <p className="muted">Loading…</p> : <dl className="settings-list">
      <div><dt>Username</dt><dd>{account.username ?? "—"}</dd></div>
      <div><dt>Email</dt><dd>{account.email ?? <span className="muted">No email added</span>}</dd></div>
      {(account.pendingEmail || sent) && <div><dt>Waiting for confirmation</dt><dd>{account.pendingEmail ?? sent}</dd></div>}
    </dl>}
    {(account?.pendingEmail || sent) && <p className="muted" role="status">We sent a confirmation link to <b>{account?.pendingEmail ?? sent}</b>. Your email changes once you click it.</p>}
    {removal === "sent" && <p className="muted" role="status">We sent a link to <b>{account?.email}</b>. Click it to confirm removing your email. The email may be titled as a sign-in link.</p>}
    {removal === "removed" && <p className="muted" role="status">Your email has been removed. Sign in with your username from now on.</p>}

    {/* Arrived through the emailed link: final confirmation. */}
    {account?.email && canRemoveNow && removal !== "removed" && <div className="settings-confirm">
      <b>Remove {account.email} from your account?</b>
      <p className="muted">{NO_RECOVERY} You can add an email again any time.</p>
      <div className="settings-actions">
        <button className="btn secondary" onClick={() => { localStorage.removeItem(REMOVE_EMAIL_FLAG); stableClose(); }}>Keep my email</button>
        <button className="btn destructive" disabled={busy} onClick={() => run(removeMyEmail, "removed")}>{busy ? "Removing…" : "Yes, remove my email"}</button>
      </div>
    </div>}

    {removal === "asking" && account?.email && <div className="settings-confirm">
      <b>Remove your email?</b>
      <p className="muted">{NO_RECOVERY} To confirm it’s you, we’ll send a link to <b>{account.email}</b>.</p>
      <div className="settings-actions">
        <button className="btn secondary" onClick={() => setRemoval("idle")}>Cancel</button>
        <button className="btn destructive" disabled={busy} onClick={() => run(() => sendEmailRemovalLink(account.email!), "sent")}>{busy ? "Sending…" : "Send confirmation link"}</button>
      </div>
    </div>}

    {account && !account.email && idle && <p className="muted">Add an email so you can recover your account if you forget your password.</p>}
    {account && idle && !(account.email && canRemoveNow) && <div className="settings-actions">
      <button className="btn primary" onClick={() => { setEditing(true); setError(""); }}>{account.email ? "Change email" : "Add email"}</button>
      {account.email && <button className="btn destructive" onClick={() => { setRemoval("asking"); setError(""); }}>Remove email</button>}
    </div>}
    {editing && <form onSubmit={submit} noValidate>
      <label>{account?.email ? "New email" : "Email"}<input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" autoFocus /></label>
      <div className="settings-actions">
        <button type="button" className="btn secondary" onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
        <button className="btn primary" disabled={busy}>{busy ? "Sending…" : "Send confirmation link"}</button>
      </div>
    </form>}
    {error && <p className="field-error" role="alert">{error}</p>}

    <h3 className="settings-heading">Your ratings</h3>
    <div className="rating-tabs">
      {(["seller", "buyer"] as const).map(role => <button key={role} className={`rating-tab${reviewTab === role ? " active" : ""}`} aria-expanded={reviewTab === role} onClick={() => setReviewTab(reviewTab === role ? null : role)}>
        <small>As {role}</small><RatingBadge rating={role === "seller" ? rating?.asSeller : rating?.asBuyer} />
      </button>)}
    </div>
    {reviewTab && <ReviewList userId={session.user.id} role={reviewTab} viewerId={session.user.id} admin={admin} onChange={loadRating} />}
  </div></div>;
}
