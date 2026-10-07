import { supabase } from "./supabase";

export const MAX_REVIEW_TEXT = 500;

// Tells the server THAT a deal step happened (see record_deal_step in
// supabase-reviews-setup.sql). Idempotent, so it's safe to call again.
export async function recordDealStep(convId: string, step: "confirm" | "payment"): Promise<void> {
  const { error } = await supabase.rpc("record_deal_step", { conv: convId, step });
  if (error) throw new Error("Could not record this step of the deal.");
}

export async function reviewsUnlocked(convId: string): Promise<boolean> {
  const { data } = await supabase.from("transactions").select("payment_sent_at").eq("conversation_id", convId).maybeSingle();
  return Boolean(data?.payment_sent_at);
}

export type MyReview = { id: number; stars: number; comment: string | null; reviewer_role: "buyer" | "seller"; followup_at: string | null; followup_stars: number | null };
export async function myReview(convId: string, myId: string): Promise<MyReview | null> {
  const { data } = await supabase.from("reviews").select("id,stars,comment,reviewer_role,followup_at,followup_stars").eq("transaction_id", convId).eq("reviewer_id", myId).maybeSingle();
  return (data as MyReview | null) ?? null;
}

const fail = (fallback: string) => (error: { code?: string; message: string }) =>
  new Error(error.code === "42501" ? error.message : fallback);

export async function submitReview(convId: string, myId: string, stars: number, comment: string, anonymous: boolean): Promise<void> {
  // reviewee and role are filled in by the database from the transaction.
  const { error } = await supabase.from("reviews").insert({ transaction_id: convId, reviewer_id: myId, reviewee_id: myId, reviewer_role: "buyer", stars, comment: comment.trim() || null, anonymous });
  if (error) throw error.code === "23505" ? new Error("You've already reviewed this deal.") : fail("Could not post your review.")(error);
}

export async function addFollowup(reviewId: number, stars: number, comment: string): Promise<void> {
  const { error } = await supabase.rpc("add_review_followup", { review: reviewId, new_stars: stars, new_comment: comment });
  if (error) throw fail("Could not post your follow-up.")(error);
}

export async function replyToReview(reviewId: number, reply: string): Promise<void> {
  const { error } = await supabase.rpc("reply_to_review", { review: reviewId, reply });
  if (error) throw fail("Could not post your reply.")(error);
}

export async function deleteReview(reviewId: number): Promise<void> {
  const { error, count } = await supabase.from("reviews").delete({ count: "exact" }).eq("id", reviewId);
  if (error || !count) throw new Error("Could not delete this review.");
}

export type PublicReview = {
  id: number; reviewer_name: string | null; reviewer_role: "buyer" | "seller"; listing_name: string;
  stars: number; comment: string | null; followup_stars: number | null; followup_comment: string | null; followup_at: string | null;
  seller_reply: string | null; seller_reply_at: string | null; created_at: string;
};
export async function reviewsFor(userId: string): Promise<PublicReview[]> {
  const { data, error } = await supabase.rpc("reviews_for", { target: userId });
  if (error) throw new Error("Could not load reviews.");
  return (data ?? []) as PublicReview[];
}

export type Rating = { asSeller: { avg: number; count: number }; asBuyer: { avg: number; count: number } };
export async function ratingSummary(userIds: string[]): Promise<Record<string, Rating>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return {};
  const { data } = await supabase.rpc("rating_summary", { users: ids });
  return Object.fromEntries((data ?? []).map((r: { user_id: string; as_seller_avg: number | null; as_seller_count: number; as_buyer_avg: number | null; as_buyer_count: number }) =>
    [r.user_id, { asSeller: { avg: Number(r.as_seller_avg ?? 0), count: r.as_seller_count }, asBuyer: { avg: Number(r.as_buyer_avg ?? 0), count: r.as_buyer_count } }]));
}

// The stars that count: a buyer's follow-up replaces their original rating.
export const effectiveStars = (r: { stars: number; followup_stars: number | null }) => r.followup_stars ?? r.stars;
