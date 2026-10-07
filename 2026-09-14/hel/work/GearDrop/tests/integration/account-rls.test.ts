import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

// Requires supabase-account-setup.sql. Skip with SKIP_RLS_INTEGRATION=1.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const run = process.env.SKIP_RLS_INTEGRATION ? describe.skip : describe;

run("remove_my_email (live Supabase)", () => {
  it("refuses anon callers", async () => {
    const { error } = await createClient(URL, KEY, { auth: { persistSession: false } }).rpc("remove_my_email");
    expect(error).not.toBeNull();
  });

  it("refuses a password session (must come from the emailed link) and leaves the email unchanged", async () => {
    const client = createClient(URL, KEY, { auth: { persistSession: false } });
    const email = `removetest_${Date.now()}@example.com`;
    const { data, error: signUpError } = await client.auth.signUp({ email, password: "TempPass123!" });
    if (signUpError || !data.session) throw signUpError ?? new Error("no session");
    const { error } = await client.rpc("remove_my_email");
    expect(error?.code).toBe("42501");
    expect((await client.auth.getUser()).data.user?.email).toBe(email);
  });
});
