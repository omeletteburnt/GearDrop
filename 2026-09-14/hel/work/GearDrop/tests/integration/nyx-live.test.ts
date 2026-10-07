import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { toCatalog } from "../../src/nyx";
import { starterListings, type Listing } from "../../src/data";

// Asks the REAL deployed Nyx (GitHub Models by default) and checks the answers are grounded in
// the listings. Uses a few of the test account's daily questions, so it's
// opt-in: NYX_LIVE=1 pnpm exec vitest run tests/integration/nyx-live.test.ts
const URL = process.env.VITE_SUPABASE_URL ?? "https://vtulwvjjvgbrgxqzeemi.supabase.co";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "sb_publishable_OvAuPane1gMMN-akEkx9Dg_IExgjo9u";
const run = process.env.NYX_LIVE ? describe : describe.skip;
const byId = new Map(starterListings.map(x => [x.id, x]));
// Models use typographic characters (non-breaking spaces, ‑ hyphens, ’ quotes).
const plain = (s: string) => s.normalize("NFKC").replace(/[\u00A0\u202F\u2007]/g, " ").replace(/[\u2010-\u2013]/g, "-").replace(/[\u2018\u2019]/g, "'");
const cited = (answer: string) => [...answer.matchAll(/\[\[listing:(\d+)\]\]/g)].map(m => byId.get(Number(m[1]))).filter(Boolean) as Listing[];

run("Nyx answers (live AI)", () => {
  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const ask = async (question: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await db.functions.invoke("nyx", { body: { question, mode: "general", history: [], catalog: toCatalog(starterListings), ...extra } });
    if (error) throw new Error(`${error.message}: ${await (error as { context?: Response }).context?.text?.()}`);
    await new Promise(r => setTimeout(r, 4000)); // stay under the free tier's per-minute cap
    return plain(String(data.answer));
  };

  beforeAll(async () => {
    const { error } = await db.auth.signUp({ email: `nyxlive_${Date.now()}@nyx.local`, password: "TempPass123!" });
    if (error) throw error;
  });

  it("$2000 gaming PC: only recommends available PCs within budget", async () => {
    const answer = await ask("I have a budget of $2000 and I'm looking for a gaming PC. What can you recommend off this website?");
    console.log("\n[$2000 PC]\n" + answer);
    const picks = cited(answer);
    expect(picks.length).toBeGreaterThan(0);
    for (const p of picks) {
      expect(p.category).toBe("PC/Laptops");
      expect(p.price).toBeLessThanOrEqual(2000);
    }
    expect(picks.some(p => p.status === "Available")).toBe(true);
  }, 60_000);

  it("states listing specs exactly as listed, and doesn't use tables", async () => {
    const answer = await ask("I have $2000 for a gaming PC. Which listings fit, and how much RAM and which CPU does each have?");
    console.log("\n[specs]\n" + answer);
    for (const p of cited(answer)) {
      if (p.specs.RAM) expect(answer).toContain(plain(p.specs.RAM));
      if (p.specs.CPU) expect(answer).toContain(plain(p.specs.CPU));
    }
    expect(answer).not.toMatch(/^\s*\|.*\|\s*$/m);
  }, 60_000);

  it("says so honestly when nothing fits instead of inventing a listing", async () => {
    const answer = await ask("Any gaming laptop under $100 on GearDrop?");
    console.log("\n[$100 laptop]\n" + answer);
    expect(cited(answer).filter(p => p.category === "PC/Laptops" && p.price <= 100)).toHaveLength(0);
    expect(answer.toLowerCase()).toMatch(/no |none|nothing|don't|doesn't|isn't|aren't|not /);
  }, 60_000);

  it("answers general hardware questions", async () => {
    const answer = await ask("Dynamic vs condenser mic for streaming in a noisy room?");
    console.log("\n[mic]\n" + answer);
    expect(answer.toLowerCase()).toContain("dynamic");
  }, 60_000);

  it("uses the focused listing for listing questions", async () => {
    const answer = await ask("Is the battery good on this?", { mode: "listing", focusIds: [5] });
    console.log("\n[listing]\n" + answer);
    expect(answer.toLowerCase()).toMatch(/battery/);
  }, 60_000);
});
