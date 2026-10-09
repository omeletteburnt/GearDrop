import { testPhoto } from "../livePhoto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// Live checks of supabase-hardening.sql. Skip with SKIP_RLS_INTEGRATION=1.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const run = process.env.SKIP_RLS_INTEGRATION ? describe.skip : describe;
const suffix = Date.now();
const IMG = "https://images.unsplash.com/photo-1590602847861-f357a9332bbc";

async function user(tag: string): Promise<{ id: string; name: string; db: SupabaseClient }> {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signUp({ email: `hardening_${tag}_${suffix}@nyx.local`, password: "TempPass123!" });
  if (error || !data.session) throw error ?? new Error("no session");
  const name = `hard_${tag}_${suffix}`.slice(0, 24);
  await db.from("profiles").upsert({ id: data.session.user.id, username: name });
  return { id: data.session.user.id, name, db };
}
const photoOf: Record<string, string> = {}; // each test user's own uploaded photo
const listing = (owner: string, extra: Record<string, unknown> = {}) =>
  ({ owner_id: owner, name: "HARDENING-ITEM", category: "Mics", price: 10, condition: "Good", image: IMG, description: "hardening test", seller: "anyone", photos: [photoOf[owner]], ...extra });

run("security hardening (live Supabase)", () => {
  let a: Awaited<ReturnType<typeof user>>, b: typeof a;
  let listingId = 0;
  beforeAll(async () => {
    [a, b] = await Promise.all([user("a"), user("b")]);
    for (const u of [a, b]) photoOf[u.id] = await testPhoto(u.db, u.id);
  }, 30_000);

  it("the seller name always comes from the owner's profile, not the client", async () => {
    const { data, error } = await a.db.from("listings").insert(listing(a.id, { seller: "Kai" })).select().single();
    expect(error).toBeNull();
    expect(data!.seller).toBe(a.name);
    listingId = data!.id;
    const upd = await a.db.from("listings").update({ seller: "Kai" }).eq("id", listingId).select().single();
    expect(upd.data!.seller).toBe(a.name);
  });

  it("an owner can't hand a listing to another account", async () => {
    await a.db.from("listings").update({ owner_id: b.id }).eq("id", listingId);
    const { data } = await b.db.from("listings").select("owner_id").eq("id", listingId).single();
    expect(data!.owner_id).toBe(a.id);
  });

  it("rejects off-site photos, oversized text, absurd prices and junk specs", async () => {
    const bad = [
      { photos: ["https://evil.example/pixel.gif"] },
      { photos: ["javascript:alert(1)"] },
      { description: "x".repeat(2001) },
      { name: "x".repeat(121) },
      { price: 1_000_000 },
      { specs: ["not", "an", "object"] },
      { specs: { big: "x".repeat(5000) } },
      { missing: Array.from({ length: 11 }, (_, i) => `m${i}`) },
    ];
    for (const extra of bad) expect((await a.db.from("listings").insert(listing(a.id, extra))).error, JSON.stringify(extra).slice(0, 60)).not.toBeNull();
  });

  it("anonymous users can't call the chat helper functions", async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc("is_conversation_participant", { conv: "00000000-0000-0000-0000-000000000000" })).error).not.toBeNull();
    expect((await anon.rpc("conversation_is_blocked", { conv: "00000000-0000-0000-0000-000000000000" })).error).not.toBeNull();
  });

  it("database trigger helpers can't be called through the API", async () => {
    for (const fn of ["conversation_set_seller", "message_before_insert", "pending_before_insert", "review_before_insert", "listing_guard", "nyx_feedback_limit"]) {
      expect((await a.db.rpc(fn)).error, fn).not.toBeNull();
    }
  });

  it("chat media uploads must be encrypted bytes (no HTML or other types)", async () => {
    const conv = await b.db.from("conversations").insert({ listing_id: listingId }).select().single();
    expect(conv.error).toBeNull();
    const path = `${conv.data!.id}/${crypto.randomUUID()}`;
    const html = new Blob(["<script>alert(1)</script>"], { type: "text/html" });
    expect((await b.db.storage.from("chat-media").upload(path, html, { contentType: "text/html" })).error).not.toBeNull();
    const ok = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" });
    expect((await b.db.storage.from("chat-media").upload(`${path}-ok`, ok, { contentType: "application/octet-stream" })).error).toBeNull();
  });

  it("Nyx feedback is capped at 50 a day per user", async () => {
    let rejected = false;
    for (let i = 0; i < 52 && !rejected; i++) rejected = Boolean((await a.db.from("nyx_feedback").insert({ user_id: a.id, helpful: true, question: "q", answer: "a" })).error);
    expect(rejected).toBe(true);
  }, 60_000);

  it("cleans up", async () => { await a.db.from("listings").delete().eq("id", listingId); });
});
