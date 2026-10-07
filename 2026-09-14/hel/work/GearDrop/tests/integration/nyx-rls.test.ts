import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

// Live checks of supabase-nyx-setup.sql. Skip with SKIP_RLS_INTEGRATION=1.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const run = process.env.SKIP_RLS_INTEGRATION ? describe.skip : describe;

run("Nyx tables (live Supabase)", () => {
  it("usage can't be read or faked by clients; remaining starts at 20; stats are admin-only", async () => {
    const db = createClient(URL, KEY, { auth: { persistSession: false } });
    const { data, error } = await db.auth.signUp({ email: `nyxrls_${Date.now()}@nyx.local`, password: "TempPass123!" });
    if (error || !data.session) throw error ?? new Error("no session");
    const id = data.session.user.id;
    expect((await db.from("nyx_usage").insert({ user_id: id })).error).not.toBeNull(); // can't add or reset usage
    expect((await db.from("nyx_usage").select("id")).data ?? []).toHaveLength(0);
    expect((await db.rpc("nyx_remaining")).data).toBe(20);
    expect((await db.rpc("nyx_stats")).error?.code).toBe("42501");
    // Feedback: can send own, can't read anyone's, can't send as someone else.
    expect((await db.from("nyx_feedback").insert({ user_id: id, helpful: true, question: "q", answer: "a" })).error).toBeNull();
    expect((await db.from("nyx_feedback").select("id")).data ?? []).toHaveLength(0);
    expect((await db.from("nyx_feedback").insert({ user_id: "00000000-0000-0000-0000-000000000000", helpful: false, question: "q", answer: "a" })).error).not.toBeNull();
    const anon = createClient(URL, KEY, { auth: { persistSession: false } });
    expect((await anon.rpc("nyx_remaining")).error).not.toBeNull();
  });
});
