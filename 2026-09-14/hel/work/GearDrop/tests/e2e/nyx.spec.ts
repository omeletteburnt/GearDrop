import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { menu } from "./menu";

// UI tests with the AI mocked (fast, free, deterministic). The real AI
// accuracy checks live in tests/integration/nyx-live.test.ts.
const suffix = Date.now();

async function signUp(page: Page, tag: string) {
  const username = `nyx_${tag}_${suffix}`.slice(0, 24);
  await menu(page, "Sign in / Sign up");
  const auth = page.locator('[role="dialog"]').first();
  await auth.getByRole("button", { name: "Need an account? Sign up" }).click();
  await auth.locator('input[name="identifier"]').fill(username);
  await auth.locator('input[name="password"]').fill("TempPass123!");
  await auth.getByRole("button", { name: "Create account" }).click();
  await expect(auth).toHaveCount(0, { timeout: 15_000 });
}

async function mockNyx(page: Page, reply: (body: { question: string; mode: string; focusIds: number[]; history: unknown[]; catalog: unknown[] }) => object, status = 200) {
  const calls: Array<Record<string, unknown>> = [];
  await page.route("**/functions/v1/nyx", async route => {
    const body = route.request().postDataJSON();
    calls.push(body);
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(reply(body)) });
  });
  await page.route("**/rest/v1/rpc/nyx_remaining", route => route.fulfill({ status: 200, contentType: "application/json", body: "20" }));
  return calls;
}

test("signed-out visitors are asked to sign in before using Nyx", async ({ page }) => {
  const calls = await mockNyx(page, () => ({ answer: "hi", remaining: 19 }));
  await page.goto("/");
  const nyx = page.locator("#nyx");
  await nyx.getByLabel("Ask Nyx anything").fill("best mouse?");
  await expect(nyx.getByText("Sign in to use Nyx")).toBeVisible();
  await nyx.getByRole("button", { name: "Ask Nyx →" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in" })).toBeVisible();
  expect(calls).toHaveLength(0);
});

test("Nyx answers with clickable listings, remembers the visit, and shows questions left", async ({ page }) => {
  const calls = await mockNyx(page, b => b.history.length
    ? { answer: "Cheaper pick: **Keychron K2** [[listing:7]]", remaining: 18 }
    : { answer: "Here's what fits your budget:\n- ASUS ROG Zephyrus G14 [[listing:5]] (demo listing)\n- Nothing else under $2000.", remaining: 19 });
  await page.goto("/");
  await signUp(page, "a");
  const nyx = page.locator("#nyx");
  await nyx.getByLabel("Ask Nyx anything").fill("I have $2000 for a gaming PC");
  await nyx.getByRole("button", { name: "Ask Nyx →" }).click();
  await expect(nyx.locator(".nyx-answer").first()).toContainText("Here's what fits your budget");
  await expect(nyx.getByText("19 of 20 questions left today")).toBeVisible();
  expect(calls[0]).toMatchObject({ mode: "general", question: "I have $2000 for a gaming PC" });
  expect((calls[0].catalog as unknown[]).length).toBeGreaterThanOrEqual(22);

  // Follow-up sends the earlier turns.
  await nyx.getByLabel("Ask Nyx anything").fill("what about something cheaper?");
  await nyx.getByLabel("Ask Nyx anything").press("Enter");
  await expect(nyx.locator(".nyx-answer").nth(1)).toContainText("Cheaper pick: Keychron K2");
  expect((calls[1].history as unknown[]).length).toBe(2);

  // Listing links open the real listing.
  await nyx.getByRole("button", { name: "View · $740" }).click();
  await expect(page.getByRole("dialog", { name: "ASUS ROG Zephyrus G14" })).toBeVisible();
});

test("download the chat as .doc, start over, then import it to continue", async ({ page }) => {
  await mockNyx(page, () => ({ answer: "Go for a 1440p monitor.", remaining: 19 }));
  await page.goto("/");
  await signUp(page, "d");
  const nyx = page.locator("#nyx");
  await nyx.getByLabel("Ask Nyx anything").fill("1080p or 1440p?");
  await nyx.getByRole("button", { name: "Ask Nyx →" }).click();
  await expect(nyx.locator(".nyx-answer")).toContainText("1440p monitor");

  const [download] = await Promise.all([page.waitForEvent("download"), nyx.getByRole("button", { name: "Download chat (.doc)" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^nyx-chat-\d{4}-\d{2}-\d{2}\.doc$/);
  const path = await download.path();
  expect(await readFile(path, "utf8")).toContain("1080p or 1440p?");

  await nyx.getByRole("button", { name: "New chat" }).click();
  await expect(nyx.locator(".nyx-answer")).toHaveCount(0);
  await nyx.locator('input[type="file"]').setInputFiles(path);
  await expect(nyx.locator(".nyx-q")).toHaveText("1080p or 1440p?");
  await expect(nyx.locator(".nyx-answer")).toContainText("1440p monitor");

  await nyx.locator('input[type="file"]').setInputFiles({ name: "random.doc", mimeType: "application/msword", buffer: Buffer.from("<html>not a chat</html>") });
  await expect(nyx.getByRole("alert")).toContainText("isn't a saved Nyx chat");
});

test("listing and compare boxes send their listings to Nyx; errors and the daily limit are shown", async ({ page }) => {
  let limitHit = false;
  const calls = await mockNyx(page, b => limitHit
    ? { error: "You've used all 20 Nyx questions for today. Try again tomorrow!", remaining: 0 }
    : { answer: b.mode === "compare" ? "The Superlight is lighter." : "Yes, great for FPS.", remaining: 5 });
  await page.goto("/");
  await signUp(page, "c");

  await page.locator(".card", { hasText: "Logitech G Pro X Superlight" }).click();
  const detail = page.getByRole("dialog", { name: "Logitech G Pro X Superlight" });
  await detail.getByLabel("Your question").fill("Good for FPS?");
  await detail.getByRole("button", { name: "Ask Nyx →" }).click();
  await expect(detail.locator(".nyx-answer")).toContainText("great for FPS");
  expect(calls.at(-1)).toMatchObject({ mode: "listing", focusIds: [1] });

  await detail.getByRole("button", { name: /compare models/i }).click();
  await page.locator(".card", { hasText: "Logitech G305 Lightspeed" }).click();
  await page.locator('[role="dialog"]').getByRole("button", { name: /compare models/i }).click();
  const aside = page.locator(".compare-nyx");
  await aside.getByLabel("Your question").fill("Which is lighter?");
  await aside.getByRole("button", { name: "Ask Nyx →" }).click();
  await expect(aside.locator(".nyx-answer")).toContainText("Superlight is lighter");
  expect(calls.at(-1)).toMatchObject({ mode: "compare", focusIds: [1, 13] });

  // Daily limit reached: friendly message, question kept for later, button disabled.
  await page.unroute("**/functions/v1/nyx");
  limitHit = true;
  await page.route("**/functions/v1/nyx", route => route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: "You've used all 20 Nyx questions for today. Try again tomorrow!", remaining: 0 }) }));
  await aside.getByLabel("Your question").fill("One more?");
  await aside.getByRole("button", { name: "Ask Nyx →" }).click();
  await expect(aside.getByRole("alert")).toHaveText("You've used all 20 Nyx questions for today. Try again tomorrow!");
  await expect(aside.getByLabel("Your question")).toHaveValue("One more?");
  await expect(aside.getByText("No questions left today")).toBeVisible();
  await expect(aside.getByRole("button", { name: "Ask Nyx →" })).toBeDisabled();
});
