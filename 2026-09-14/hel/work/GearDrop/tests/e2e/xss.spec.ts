import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

// Verifies that XSS payloads stored in listing fields (e.g. via a direct API
// call bypassing the UI, or a future compromised upstream) render as inert
// text in the actual app, not as executed markup/script. This is a real
// browser check, not just a claim that "React escapes JSX text" — it plants
// a live listing with script/event-handler payloads, loads the real page,
// and asserts nothing executed.
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const suffix = Date.now();

test("XSS payloads in listing fields render as inert text", async ({ page }) => {
  const setup = createClient(URL, KEY);
  const email = `rlstest_xss_${suffix}@nyx.local`;
  const { data, error } = await setup.auth.signUp({ email, password: "TempPass123!" });
  if (error || !data.session) throw error ?? new Error("signUp returned no session");

  const asOwner = createClient(URL, KEY, { global: { headers: { Authorization: `Bearer ${data.session.access_token}` } } });
  await asOwner.from("profiles").upsert({ id: data.session.user.id, username: `rlstest_xss_${suffix}` });

  const payloadName = `<script>window.__xssFired=true</script>XSS-TEST-${suffix}`;
  const payloadDescription = `<img src=x onerror="window.__xssFired=true">`;
  const { data: listing, error: insertError } = await asOwner.from("listings").insert({
    owner_id: data.session.user.id,
    name: payloadName,
    category: "Mics",
    price: 1,
    condition: "Good",
    image: "https://images.unsplash.com/photo-1590602847861-f357a9332bbc",
    description: payloadDescription,
    seller: "xss-test",
  }).select().single();
  if (insertError) throw insertError;

  try {
    let fired = false;
    page.on("dialog", () => { fired = true; });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const xssFired = await page.evaluate(() => (window as any).__xssFired === true);
    expect(xssFired).toBe(false);
    expect(fired).toBe(false);

    // The payload should be visible as literal text somewhere on the page
    // (proving it rendered as escaped content, not that it vanished).
    await expect(page.getByText(payloadName, { exact: false })).toBeVisible();
  } finally {
    await asOwner.from("listings").delete().eq("id", listing!.id);
  }
});
