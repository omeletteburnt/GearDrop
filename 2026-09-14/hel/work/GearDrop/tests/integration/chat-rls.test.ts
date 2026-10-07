import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Live checks of the policies in supabase-chat-setup.sql. Requires that file
// to have been run in the project. Skip with SKIP_RLS_INTEGRATION=1.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const run = process.env.SKIP_RLS_INTEGRATION ? describe.skip : describe;
const suffix = Date.now();
const password = "TempPass123!";

async function user(tag: string): Promise<{ id: string; db: SupabaseClient }> {
  const setup = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await setup.auth.signUp({ email: `chattest_${tag}_${suffix}@nyx.local`, password });
  if (error || !data.session) throw error ?? new Error("signUp returned no session");
  const db = createClient(URL, KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
  await db.from("profiles").upsert({ id: data.session.user.id, username: `chat_${tag}_${suffix}`.slice(0, 24) });
  return { id: data.session.user.id, db };
}
const msg = (conversation_id: string, sender_id: string) => ({ conversation_id, sender_id, ciphertext: "Y2lwaGVy", iv: "aXZpdml2aXZpdml2" });

run("chat RLS policies (live Supabase)", () => {
  let seller: Awaited<ReturnType<typeof user>>, buyer: typeof seller, outsider: typeof seller;
  let listingId = 0, convId = "";

  beforeAll(async () => {
    [seller, buyer, outsider] = await Promise.all([user("s"), user("b"), user("o")]);
    const { data, error } = await seller.db.from("listings").insert({ owner_id: seller.id, name: "VITEST-CHAT-ITEM", category: "Mics", price: 10, condition: "Good", image: "http://x", description: "chat rls test", seller: "chat_s" }).select().single();
    if (error) throw error;
    listingId = data.id;
  }, 30_000);

  afterAll(async () => { if (listingId) await seller.db.from("listings").delete().eq("id", listingId); });

  it("seller_id always comes from the listing, never from the client", async () => {
    const { data, error } = await buyer.db.from("conversations").insert({ listing_id: listingId, seller_id: outsider.id }).select().single();
    expect(error).toBeNull();
    expect(data!.seller_id).toBe(seller.id);
    expect(data!.buyer_id).toBe(buyer.id);
    convId = data!.id;
  });

  it("a seller cannot open a conversation on their own listing", async () => {
    const { error } = await seller.db.from("conversations").insert({ listing_id: listingId });
    expect(error).not.toBeNull();
  });

  it("participants can send and read; the conversation's last-message fields update", async () => {
    expect((await buyer.db.from("messages").insert(msg(convId, buyer.id))).error).toBeNull();
    const read = await seller.db.from("messages").select("id").eq("conversation_id", convId);
    expect(read.data).toHaveLength(1);
    const conv = await seller.db.from("conversations").select("last_sender_id,last_message_at").eq("id", convId).single();
    expect(conv.data!.last_sender_id).toBe(buyer.id);
    expect(conv.data!.last_message_at).not.toBeNull();
  });

  it("outsiders and anon can't see the conversation or its messages, or post into it", async () => {
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    for (const db of [outsider.db, anon]) {
      expect((await db.from("conversations").select("id").eq("id", convId)).data ?? []).toHaveLength(0);
      expect((await db.from("messages").select("id").eq("conversation_id", convId)).data ?? []).toHaveLength(0);
    }
    expect((await outsider.db.from("messages").insert(msg(convId, outsider.id))).error).not.toBeNull();
  });

  it("a sender can't be spoofed", async () => {
    const { error } = await buyer.db.from("messages").insert(msg(convId, seller.id));
    expect(error).not.toBeNull();
  });

  it("messages and conversations can't be edited or deleted", async () => {
    const upd = await buyer.db.from("messages").update({ ciphertext: "aGFja2Vk" }, { count: "exact" }).eq("conversation_id", convId);
    expect(upd.count ?? 0).toBe(0);
    const del = await buyer.db.from("messages").delete({ count: "exact" }).eq("conversation_id", convId);
    expect(del.count ?? 0).toBe(0);
    const delConv = await buyer.db.from("conversations").delete({ count: "exact" }).eq("id", convId);
    expect(delConv.count ?? 0).toBe(0);
    expect((await seller.db.from("messages").select("ciphertext").eq("conversation_id", convId)).data![0].ciphertext).toBe("Y2lwaGVy");
  });

  it("blocking stops messages in both directions until unblocked", async () => {
    expect((await seller.db.from("blocks").insert({ blocker_id: seller.id, blocked_id: buyer.id })).error).toBeNull();
    expect((await buyer.db.from("messages").insert(msg(convId, buyer.id))).error).not.toBeNull();
    expect((await seller.db.from("messages").insert(msg(convId, seller.id))).error).not.toBeNull();
    expect((await buyer.db.from("blocks").select("blocker_id")).data).toHaveLength(0); // the blocked user can't see the block list
    await seller.db.from("blocks").delete().eq("blocker_id", seller.id).eq("blocked_id", buyer.id);
    expect((await seller.db.from("messages").insert(msg(convId, seller.id))).error).toBeNull();
  });

  it("key backups are owner-only; public keys are readable by signed-in users", async () => {
    await seller.db.from("key_backups").upsert({ user_id: seller.id, wrapped_key: "d3JhcHBlZA", salt: "c2FsdA", iv: "aXY" });
    await seller.db.from("public_keys").upsert({ user_id: seller.id, public_key: { kty: "EC", crv: "P-256", x: "x", y: "y" } });
    expect((await outsider.db.from("key_backups").select("user_id").eq("user_id", seller.id)).data).toHaveLength(0);
    expect((await seller.db.from("key_backups").select("user_id").eq("user_id", seller.id)).data).toHaveLength(1);
    expect((await outsider.db.from("public_keys").select("user_id").eq("user_id", seller.id)).data).toHaveLength(1);
    expect((await outsider.db.from("public_keys").upsert({ user_id: seller.id, public_key: {} })).error).not.toBeNull();
  });

  it("encrypted media: participants can upload and download, outsiders can't", async () => {
    const path = `${convId}/${crypto.randomUUID()}`;
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" });
    expect((await buyer.db.storage.from("chat-media").upload(path, blob)).error).toBeNull();
    expect((await seller.db.storage.from("chat-media").download(path)).error).toBeNull();
    expect((await outsider.db.storage.from("chat-media").download(path)).data).toBeNull();
    expect((await outsider.db.storage.from("chat-media").upload(`${convId}/${crypto.randomUUID()}`, blob)).error).not.toBeNull();
  });

  it("held messages: only the sender can read or remove them; the recipient only sees a count", async () => {
    const held = { conversation_id: convId, sender_id: buyer.id, ciphertext: "aGVsZA", iv: "aXZpdml2aXZpdml2" };
    expect((await buyer.db.from("pending_messages").insert(held)).error).toBeNull();
    expect((await buyer.db.from("pending_messages").select("id").eq("conversation_id", convId)).data).toHaveLength(1);
    expect((await seller.db.from("pending_messages").select("id").eq("conversation_id", convId)).data).toHaveLength(0);
    expect((await seller.db.rpc("incoming_pending_count", { conv: convId })).data).toBe(1);
    expect((await outsider.db.rpc("incoming_pending_count", { conv: convId })).data).toBe(0);
    expect((await outsider.db.from("pending_messages").insert({ ...held, sender_id: outsider.id })).error).not.toBeNull();
    expect((await buyer.db.from("pending_messages").insert({ ...held, sender_id: seller.id })).error).not.toBeNull();
    const sellerDelete = await seller.db.from("pending_messages").delete({ count: "exact" }).eq("conversation_id", convId);
    expect(sellerDelete.count ?? 0).toBe(0);
    const buyerDelete = await buyer.db.from("pending_messages").delete({ count: "exact" }).eq("conversation_id", convId);
    expect(buyerDelete.count).toBe(1);
  });

  it("rate-limits a sender to 20 messages per minute", async () => {
    let rejected = false;
    for (let i = 0; i < 22 && !rejected; i++) rejected = Boolean((await buyer.db.from("messages").insert(msg(convId, buyer.id))).error);
    expect(rejected).toBe(true);
  }, 30_000);
});
