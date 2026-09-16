import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// These are the *public* client-side values GearDrop already ships in its bundle
// (Vite bakes VITE_-prefixed vars into the client build, so they carry no
// confidentiality — RLS, not secrecy, is what protects the data behind them).
// Override via env vars if the project URL/key ever changes.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";

const run = process.env.SKIP_RLS_INTEGRATION ? describe.skip : describe;
const suffix = Date.now();

run("RLS policies (live Supabase)", () => {
  const anon = createClient(URL, KEY);
  let userAId = "";
  let userAToken = "";
  let listingId: number;

  const emailA = `rlstest_vitest_a_${suffix}@nyx.local`;
  const emailB = `rlstest_vitest_b_${suffix}@nyx.local`;
  const password = "TempPass123!";

  beforeAll(async () => {
    // Use a throwaway client for account setup so the shared `anon` client
    // (used below for genuinely-unauthenticated assertions) never picks up
    // a persisted session as a side effect of signUp/signIn calls.
    const setup = createClient(URL, KEY);
    const { data, error } = await setup.auth.signUp({ email: emailA, password });
    if (error || !data.session) throw error ?? new Error("signUp returned no session");
    userAId = data.session.user.id;
    userAToken = data.session.access_token;
    const asA = createClient(URL, KEY, { global: { headers: { Authorization: `Bearer ${userAToken}` } } });
    await asA.from("profiles").upsert({ id: userAId, username: `rlstest_vitest_a_${suffix}` });
  });

  afterAll(async () => {
    // Best-effort cleanup: remove the listing if a test failed before deleting it.
    // The disposable auth users themselves are left for the operator to remove
    // (no delete policy on profiles, and this suite intentionally never handles
    // a service-role key).
    if (listingId) await anon.from("listings").delete().eq("id", listingId);
  });

  it("allows anon SELECT on listings and profiles", async () => {
    const listings = await anon.from("listings").select("id").limit(1);
    expect(listings.error).toBeNull();
    const profiles = await anon.from("profiles").select("username").limit(1);
    expect(profiles.error).toBeNull();
  });

  it("rejects anon INSERT on listings", async () => {
    const { error } = await anon.from("listings").insert({
      name: "should-not-insert", category: "Mics", price: 1, condition: "Good",
      image: "http://x", description: "x", seller: "x",
    });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });

  it("lets a signed-in user create their own listing", async () => {
    const asA = createClient(URL, KEY, { global: { headers: { Authorization: `Bearer ${userAToken}` } } });
    const { data, error } = await asA.from("listings").insert({
      owner_id: userAId, name: "VITEST-RLS-ITEM", category: "Mics", price: 1,
      condition: "Good", image: "http://x", description: "vitest rls test", seller: "rlstest_vitest_a",
    }).select().single();
    expect(error).toBeNull();
    listingId = data!.id;
  });

  it("rejects deletes from anon and from a different signed-in user, but persists the row", async () => {
    const before = await anon.from("listings").select("id").eq("id", listingId).single();
    expect(before.data).not.toBeNull();

    const anonDelete = await anon.from("listings").delete({ count: "exact" }).eq("id", listingId);
    expect(anonDelete.count).toBe(0);

    const setupB = createClient(URL, KEY);
    const { data: signupB, error: signupErrB } = await setupB.auth.signUp({ email: emailB, password });
    if (signupErrB || !signupB.session) throw signupErrB ?? new Error("signUp B returned no session");
    const asB = createClient(URL, KEY, { global: { headers: { Authorization: `Bearer ${signupB.session.access_token}` } } });
    await asB.from("profiles").upsert({ id: signupB.session.user.id, username: `rlstest_vitest_b_${suffix}` });
    const crossDelete = await asB.from("listings").delete({ count: "exact" }).eq("id", listingId);
    expect(crossDelete.count).toBe(0);

    const after = await anon.from("listings").select("id").eq("id", listingId).single();
    expect(after.data).not.toBeNull();
  });

  it("lets the owner delete their own listing", async () => {
    const asA = createClient(URL, KEY, { global: { headers: { Authorization: `Bearer ${userAToken}` } } });
    const { count, error } = await asA.from("listings").delete({ count: "exact" }).eq("id", listingId);
    expect(error).toBeNull();
    expect(count).toBe(1);
    listingId = 0; // deleted; afterAll cleanup no longer needs to touch it
  });

  it("rejects anon execution of the is_admin RPC", async () => {
    const { error } = await anon.rpc("is_admin");
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });
});
