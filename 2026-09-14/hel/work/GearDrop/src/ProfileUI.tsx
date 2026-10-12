import { useCallback, useEffect, useRef, useState } from "react";
import type { Listing } from "./data";
import { overlayClick, useModalA11y } from "./modal";
import { ratingSummary, type Rating } from "./reviews";
import { RatingBadge, ReviewList, Stars } from "./ReviewsUI";
import { getProfile } from "./supabase";
import { safeImageUrl } from "./validation";

export type ProfileTarget = { id: string; name: string; role: "seller" | "buyer" };

// "★★★★☆ 4.2 (5 reviews)" for someone's rating in one role.
export function StarRating({ rating }: { rating?: Rating["asSeller"] }) {
  if (!rating?.count) return <span className="star-rating muted">No reviews yet</span>;
  return <span className="star-rating"><Stars value={rating.avg} /> {rating.avg.toFixed(1)} <small>({rating.count} review{rating.count === 1 ? "" : "s"})</small></span>;
}

// Someone's public profile: join date, ratings, reviews and what they're selling.
export function ProfilePopup({ target, listings, viewerId, admin, close, openListing, onReviewsChange }: { target: ProfileTarget; listings: Listing[]; viewerId?: string; admin: boolean; close: () => void; openListing: (l: Listing) => void; onReviewsChange?: () => void }) {
  const [since, setSince] = useState<string | null>(null);
  const [rating, setRating] = useState<Rating | null>(null);
  const [tab, setTab] = useState<"seller" | "buyer">(target.role);
  const loadRating = useCallback(() => ratingSummary([target.id]).then(r => setRating(r[target.id] ?? null)).catch(() => undefined), [target.id]);
  useEffect(() => { getProfile(target.id).then(p => setSince(p ? new Date(p.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null)); loadRating(); }, [target.id, loadRating]);
  const selling = listings.filter(l => l.ownerId === target.id && l.status !== "Sold");
  const ref = useRef<HTMLDivElement>(null); useModalA11y(ref, close);

  return <div className="overlay" onMouseDown={overlayClick(close)}><div className="sell-form profile" ref={ref} role="dialog" aria-modal="true" aria-label={`${target.name}’s profile`}>
    <button className="close" onClick={close} aria-label="Close">×</button>
    <p className="eyebrow">PROFILE</p>
    <h2>{target.name}</h2>
    {since && <p className="muted">Member since {since}</p>}

    <h3 className="settings-heading">Reputation</h3>
    <div className="rating-tabs" role="group" aria-label="Review role">
      {(["seller", "buyer"] as const).map(role => <button key={role} aria-pressed={tab === role} className={`rating-tab${tab === role ? " active" : ""}`} onClick={() => setTab(role)}>
        <small>As {role}</small><RatingBadge rating={role === "seller" ? rating?.asSeller : rating?.asBuyer} />
      </button>)}
    </div>
    <ReviewList key={tab} userId={target.id} role={tab} viewerId={viewerId} admin={admin} onChange={() => { loadRating(); onReviewsChange?.(); }} />

    <h3 className="settings-heading">Selling now</h3>
    {selling.length ? <ul className="profile-listings">{selling.map(l => <li key={l.id}><button onClick={() => openListing(l)}>
      <img src={safeImageUrl(l.image)} alt="" /><span><b>{l.name}</b><small>${l.price} · {l.condition}{l.status !== "Available" && ` · ${l.status}`}</small></span>
    </button></li>)}</ul> : <p className="muted">Nothing for sale right now.</p>}
  </div></div>;
}
