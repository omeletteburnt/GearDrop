import { useCallback, useEffect, useState, type FormEvent } from "react";
import { addFollowup, deleteReview, effectiveStars, MAX_REVIEW_TEXT, myReview, replyToReview, reviewsFor, reviewsUnlocked, submitReview, type MyReview, type PublicReview, type Rating } from "./reviews";

const date = (iso: string) => new Date(iso).toLocaleDateString();

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return <span className="stars" role="img" aria-label={`${value} out of 5 stars`}>{"★".repeat(full)}<span className="stars-empty">{"★".repeat(5 - full)}</span></span>;
}

export function RatingBadge({ rating }: { rating?: Rating["asSeller"] }) {
  if (!rating?.count) return <span className="rating-badge muted">No reviews yet</span>;
  return <span className="rating-badge">★ {rating.avg.toFixed(1)} <small>({rating.count} review{rating.count === 1 ? "" : "s"})</small></span>;
}

function StarPicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return <div className="star-picker" role="radiogroup" aria-label={label}>
    {[1, 2, 3, 4, 5].map(n => <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n === 1 ? "" : "s"}`} className={n <= value ? "on" : ""} onClick={() => onChange(n)}>★</button>)}
  </div>;
}

// The reviews someone has received in one role. role "seller" = reviews
// buyers left about this person as a seller; "buyer" = what sellers said.
export function ReviewList({ userId, role, viewerId, admin, onChange }: { userId: string; role: "seller" | "buyer"; viewerId?: string; admin?: boolean; onChange?: () => void }) {
  const [reviews, setReviews] = useState<PublicReview[] | null>(null); const [error, setError] = useState("");
  const load = useCallback(() => reviewsFor(userId).then(all => setReviews(all.filter(r => r.reviewer_role === (role === "seller" ? "buyer" : "seller")))).catch(e => setError(e.message)), [userId, role]);
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); onChange?.(); };
  if (error) return <p className="field-error" role="alert">{error}</p>;
  if (!reviews) return <p className="muted">Loading reviews…</p>;
  if (!reviews.length) return <p className="muted">No reviews yet.</p>;
  return <ul className="review-list">{reviews.map(r => <ReviewItem key={r.id} r={r} canReply={viewerId === userId && r.reviewer_role === "buyer" && !r.seller_reply} admin={admin} changed={changed} />)}</ul>;
}

function ReviewItem({ r, canReply, admin, changed }: { r: PublicReview; canReply: boolean; admin?: boolean; changed: () => void }) {
  const [replying, setReplying] = useState(false); const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function act(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); changed(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }
  const who = r.reviewer_name ?? (r.reviewer_role === "buyer" ? "Anonymous buyer" : "Anonymous");
  return <li className="review">
    <div className="review-head"><Stars value={effectiveStars(r)} /><b>{who}</b><small>{r.reviewer_role === "buyer" ? "bought" : "sold"} {r.listing_name} · {date(r.created_at)}</small></div>
    {r.followup_at && <p className="review-original"><small>Originally <Stars value={r.stars} /></small></p>}
    {r.comment && <p>{r.comment}</p>}
    {r.followup_at && <div className="review-followup"><small>Follow-up · {date(r.followup_at)}</small>{r.followup_comment && <p>{r.followup_comment}</p>}</div>}
    {r.seller_reply && <div className="review-reply"><small>Seller’s reply · {date(r.seller_reply_at!)}</small><p>{r.seller_reply}</p></div>}
    {canReply && !replying && <button className="example" onClick={() => setReplying(true)}>Reply publicly</button>}
    {replying && canReply && <form onSubmit={(e: FormEvent) => { e.preventDefault(); act(async () => { await replyToReview(r.id, reply); setReplying(false); }); }}>
      <textarea value={reply} onChange={e => setReply(e.target.value)} maxLength={MAX_REVIEW_TEXT} aria-label="Your reply" placeholder="Thank the buyer or respond to their feedback. You can only reply once." />
      <div className="settings-actions"><button type="button" className="btn secondary" onClick={() => setReplying(false)}>Cancel</button><button className="btn primary" disabled={busy || !reply.trim()}>Post reply</button></div>
    </form>}
    {admin && <button className="example destructive-link" disabled={busy} onClick={() => { if (window.confirm("Delete this review? This cannot be undone.")) act(() => deleteReview(r.id)); }}>Delete review (admin)</button>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </li>;
}

// Shown in the chat once the deal is confirmed and payment details are sent.
export function ReviewBar({ convId, myId, isSeller, otherName, paymentSent }: { convId: string; myId: string; isSeller: boolean; otherName: string; paymentSent: boolean }) {
  const [unlocked, setUnlocked] = useState(false); const [mine, setMine] = useState<MyReview | null>(null);
  const [open, setOpen] = useState(false); const [stars, setStars] = useState(0); const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => {
    const ok = await reviewsUnlocked(convId);
    setUnlocked(ok);
    if (ok) setMine(await myReview(convId, myId));
  }, [convId, myId]);
  // Re-check when payment details arrive (the seller's client records it).
  useEffect(() => { if (!paymentSent) return; load(); const id = setTimeout(load, 2500); return () => clearTimeout(id); }, [paymentSent, load]);
  if (!unlocked) return null;

  const followingUp = Boolean(mine && !isSeller && !mine.followup_at);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!stars) { setError("Choose a star rating."); return; }
    setBusy(true); setError("");
    try {
      if (mine) await addFollowup(mine.id, stars, comment); else await submitReview(convId, myId, stars, comment, !isSeller && anonymous);
      setOpen(false); setStars(0); setComment(""); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not post your review."); }
    finally { setBusy(false); }
  }

  if (!open) return <div className="review-bar">
    {mine ? <span>You rated {otherName} <Stars value={mine.followup_stars ?? mine.stars} />{mine.followup_at && " (updated)"}</span> : <span>How was {isSeller ? "this buyer" : "this seller"}?</span>}
    {!mine && <button className="btn primary" onClick={() => setOpen(true)}>Leave a review</button>}
    {followingUp && <button className="btn secondary" onClick={() => setOpen(true)}>Add follow-up</button>}
  </div>;

  return <form className="review-bar review-form" onSubmit={submit}>
    <b>{mine ? "Follow-up review" : `Review ${otherName}`}</b>
    {mine && <small className="muted">Your new rating replaces the original in {otherName}’s average. You can only add one follow-up.</small>}
    <StarPicker value={stars} onChange={setStars} label={mine ? "Updated rating" : "Rating"} />
    <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={MAX_REVIEW_TEXT} aria-label="Comment (optional)" placeholder={mine ? "How is it going since the purchase? (optional)" : "How did it go? (optional)"} />
    {!isSeller && !mine && <label className="checkbox-row"><input type="checkbox" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} /> Post anonymously (your name won’t be shown)</label>}
    {error && <p className="field-error" role="alert">{error}</p>}
    <div className="settings-actions"><button type="button" className="btn secondary" onClick={() => { setOpen(false); setError(""); }}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? "Posting…" : "Post"}</button></div>
  </form>;
}
