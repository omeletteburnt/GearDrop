import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// Live checks of supabase-reviews-setup.sql. Skip with SKIP_RLS_INTEGRATION=1.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const run = process.env.SKIP_RLS_INTEGRATION ? describe.skip : describe;
const suffix = Date.now();

async function user(tag: string): Promise<{ id: string; name: string; db: SupabaseClient }> {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signUp({ email: `revtest_${tag}_${suffix}@nyx.local`, password: "TempPass123!" });
  if (error || !data.session) throw error ?? new Error("no session");
  const name = `rev_${tag}_${suffix}`.slice(0, 24);
  await db.from("profiles").upsert({ id: data.session.user.id, username: name });
  return { id: data.session.user.id, name, db };
}
const review = (convId: string, reviewerId: string, stars: number, extra: Record<string, unknown> = {}) =>
  ({ transaction_id: convId, reviewer_id: reviewerId, reviewee_id: reviewerId, reviewer_role: "buyer", stars, ...extra });

run("reviews (live Supabase)", () => {
  let seller: Awaited<ReturnType<typeof user>>, buyer: typeof seller, outsider: typeof seller;
  let listingId = 0, convId = "", buyerReviewId = 0, sellerReviewId = 0;

  beforeAll(async () => {
    [seller, buyer, outsider] = await Promise.all([user("s"), user("b"), user("o")]);
    const listing = await seller.db.from("listings").insert({ owner_id: seller.id, name: "VITEST-REVIEW-ITEM", category: "Mics", price: 10, condition: "Good", image: "http://x", description: "review test", seller: seller.name }).select().single();
    if (listing.error) throw listing.error;
    listingId = listing.data.id;
    const conv = await buyer.db.from("conversations").insert({ listing_id: listingId }).select().single();
    if (conv.error) throw conv.error;
    convId = conv.data.id;
  }, 30_000);

  it("no reviews before a transaction, and outsiders can't record deal steps", async () => {
    expect((await buyer.db.from("reviews").insert(review(convId, buyer.id, 5))).error).not.toBeNull();
    expect((await outsider.db.rpc("record_deal_step", { conv: convId, step: "confirm" })).error).not.toBeNull();
  });

  it("payment only counts after BOTH confirmed, and only the seller can record it", async () => {
    await buyer.db.rpc("record_deal_step", { conv: convId, step: "confirm" });
    await seller.db.rpc("record_deal_step", { conv: convId, step: "payment" }); // seller hasn't confirmed yet
    expect((await buyer.db.from("transactions").select("payment_sent_at").eq("conversation_id", convId).single()).data!.payment_sent_at).toBeNull();
    await seller.db.rpc("record_deal_step", { conv: convId, step: "confirm" });
    expect((await buyer.db.rpc("record_deal_step", { conv: convId, step: "payment" })).error).not.toBeNull();
    expect((await seller.db.rpc("record_deal_step", { conv: convId, step: "payment" })).error).toBeNull();
    expect((await buyer.db.from("transactions").select("payment_sent_at").eq("conversation_id", convId).single()).data!.payment_sent_at).not.toBeNull();
    expect((await outsider.db.from("transactions").select("conversation_id").eq("conversation_id", convId)).data).toHaveLength(0);
  });

  it("both sides can review once; roles and reviewee come from the transaction, not the client", async () => {
    const b = await buyer.db.from("reviews").insert(review(convId, buyer.id, 2, { comment: "Slow reply", anonymous: true, reviewee_id: outsider.id, reviewer_role: "seller" })).select().single();
    expect(b.error).toBeNull();
    expect(b.data).toMatchObject({ reviewee_id: seller.id, reviewer_role: "buyer", anonymous: true });
    buyerReviewId = b.data!.id;
    const s = await seller.db.from("reviews").insert(review(convId, seller.id, 5, { anonymous: true })).select().single();
    expect(s.error).toBeNull();
    expect(s.data).toMatchObject({ reviewee_id: buyer.id, reviewer_role: "seller", anonymous: false }); // sellers can't be anonymous
    sellerReviewId = s.data!.id;
    expect((await buyer.db.from("reviews").insert(review(convId, buyer.id, 5))).error?.code).toBe("23505");
    expect((await outsider.db.from("reviews").insert(review(convId, outsider.id, 1))).error).not.toBeNull();
    expect((await buyer.db.from("reviews").insert(review(convId, seller.id, 1))).error).not.toBeNull(); // spoofed reviewer
  });

  it("anonymous reviews hide the reviewer from everyone, including the seller", async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data } = await anon.rpc("reviews_for", { target: seller.id });
    expect(data).toHaveLength(1);
    expect(data![0]).toMatchObject({ reviewer_name: null, listing_name: "VITEST-REVIEW-ITEM", stars: 2 });
    expect(JSON.stringify(data)).not.toContain(buyer.id);
    expect((await seller.db.from("reviews").select("reviewer_id").eq("id", buyerReviewId)).data).toHaveLength(0);
    const named = await anon.rpc("reviews_for", { target: buyer.id });
    expect(named.data![0].reviewer_name).toBe(seller.name);
  });

  it("buyers get one follow-up whose stars replace the original in the average; sellers get none", async () => {
    expect((await seller.db.rpc("add_review_followup", { review: sellerReviewId, new_stars: 1, new_comment: "x" })).error).not.toBeNull();
    expect((await outsider.db.rpc("add_review_followup", { review: buyerReviewId, new_stars: 5, new_comment: "x" })).error).not.toBeNull();
    expect((await buyer.db.rpc("add_review_followup", { review: buyerReviewId, new_stars: 4, new_comment: "Sorted it out" })).error).toBeNull();
    expect((await buyer.db.rpc("add_review_followup", { review: buyerReviewId, new_stars: 5, new_comment: "again" })).error).not.toBeNull();
    const { data } = await outsider.db.rpc("rating_summary", { users: [seller.id, buyer.id] });
    const bySeller = data!.find((r: { user_id: string }) => r.user_id === seller.id);
    const byBuyer = data!.find((r: { user_id: string }) => r.user_id === buyer.id);
    expect(bySeller).toMatchObject({ as_seller_count: 1, as_buyer_count: 0 });
    expect(Number(bySeller.as_seller_avg)).toBe(4);
    expect(Number(byBuyer.as_buyer_avg)).toBe(5);
  });

  it("only the seller can reply, once, and only to a buyer's review", async () => {
    expect((await buyer.db.rpc("reply_to_review", { review: buyerReviewId, reply: "me too" })).error).not.toBeNull();
    expect((await buyer.db.rpc("reply_to_review", { review: sellerReviewId, reply: "thanks" })).error).not.toBeNull(); // buyer replying to the seller's review of them
    expect((await seller.db.rpc("reply_to_review", { review: buyerReviewId, reply: "Sorry for the wait!" })).error).toBeNull();
    expect((await seller.db.rpc("reply_to_review", { review: buyerReviewId, reply: "again" })).error).not.toBeNull();
    const { data } = await outsider.db.rpc("reviews_for", { target: seller.id });
    expect(data![0].seller_reply).toBe("Sorry for the wait!");
  });

  it("reviews can't be edited or deleted by non-admins, and survive the listing being deleted", async () => {
    const upd = await buyer.db.from("reviews").update({ stars: 5 }, { count: "exact" }).eq("id", buyerReviewId);
    expect(upd.count ?? 0).toBe(0);
    for (const db of [buyer.db, seller.db]) expect((await db.from("reviews").delete({ count: "exact" }).eq("id", buyerReviewId)).count ?? 0).toBe(0);
    await seller.db.from("listings").delete().eq("id", listingId);
    const { data } = await outsider.db.rpc("reviews_for", { target: seller.id });
    expect(data).toHaveLength(1);
  });
});
