import { testPhoto } from "../livePhoto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Live checks of supabase-photos-setup.sql. Skip with SKIP_RLS_INTEGRATION=1.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const run = process.env.SKIP_RLS_INTEGRATION ? describe.skip : describe;
const suffix = Date.now();
const BUCKET = "listing-photos";
const png = () => new Blob([Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), c => c.charCodeAt(0))], { type: "image/png" });

async function user(tag: string): Promise<{ id: string; db: SupabaseClient }> {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.auth.signUp({ email: `photos_${tag}_${suffix}@nyx.local`, password: "TempPass123!" });
  if (error || !data.session) throw error ?? new Error("no session");
  await db.from("profiles").upsert({ id: data.session.user.id, username: `ph_${tag}_${suffix}`.slice(0, 24) });
  return { id: data.session.user.id, db };
}
const listing = (extra: Record<string, unknown>) =>
  ({ name: "PHOTO-RLS-ITEM", category: "Mics", price: 10, condition: "Good", image: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc", description: "photo rls test", seller: "x", ...extra });

run("listing photos (live Supabase)", () => {
  let a: Awaited<ReturnType<typeof user>>, b: typeof a;
  let aPhoto = "", bPhoto = "";
  const created: number[] = [];
  beforeAll(async () => {
    [a, b] = await Promise.all([user("a"), user("b")]);
    [aPhoto, bPhoto] = await Promise.all([testPhoto(a.db, a.id), testPhoto(b.db, b.id)]);
  }, 30_000);
  afterAll(async () => { for (const id of created) await a.db.from("listings").delete().eq("id", id); });

  it("new listings need at least one photo", async () => {
    const { error } = await a.db.from("listings").insert(listing({ photos: [] }));
    expect(error?.code).toBe("23514");
  });

  it("the cover is always the first photo, whatever image the client sends", async () => {
    const second = await testPhoto(a.db, a.id);
    const { data, error } = await a.db.from("listings").insert(listing({ photos: [aPhoto, second], image: "https://evil.example/x.gif" })).select().single();
    expect(error).toBeNull();
    created.push(data!.id);
    expect(data!.image).toBe(aPhoto);
    const upd = await a.db.from("listings").update({ image: "https://images.unsplash.com/photo-1" }).eq("id", data!.id).select().single();
    expect(upd.data!.image).toBe(aPhoto);
  });

  it("only accepts the seller's own uploads, at most 5", async () => {
    const theirs = await a.db.from("listings").insert(listing({ photos: [bPhoto] }));
    expect(theirs.error?.code).toBe("42501");
    const offSite = await a.db.from("listings").insert(listing({ photos: ["https://evil.example/x.jpg"] }));
    expect(offSite.error).not.toBeNull();
    const six = await a.db.from("listings").insert(listing({ photos: Array(6).fill(aPhoto) }));
    expect(six.error).not.toBeNull();
  });

  it("uploads only go into your own folder, and only as images", async () => {
    expect((await a.db.storage.from(BUCKET).upload(`${b.id}/${crypto.randomUUID()}.jpg`, png(), { contentType: "image/png" })).error).not.toBeNull();
    const html = new Blob(["<script>alert(1)</script>"], { type: "text/html" });
    expect((await a.db.storage.from(BUCKET).upload(`${a.id}/${crypto.randomUUID()}.jpg`, html, { contentType: "text/html" })).error).not.toBeNull();
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.storage.from(BUCKET).upload(`${a.id}/${crypto.randomUUID()}.jpg`, png(), { contentType: "image/png" })).error).not.toBeNull();
  });

  it("anyone can view a photo, but only its owner can delete it", async () => {
    expect((await fetch(bPhoto)).status).toBe(200);
    const path = bPhoto.split(`/${BUCKET}/`)[1];
    const { data: gone } = await a.db.storage.from(BUCKET).remove([path]);
    expect(gone ?? []).toHaveLength(0); // a can't delete b's photo
    expect((await fetch(`${bPhoto}?t=${Date.now()}`)).status).toBe(200);
    await b.db.storage.from(BUCKET).remove([path]);
    expect((await fetch(`${bPhoto}?t=${Date.now()}`)).status).not.toBe(200);
  });
});
