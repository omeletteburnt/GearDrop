import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { menu, expectSignedIn } from "./menu";

test("demo listings can't be messaged", async ({ page }) => {
  await page.goto("/");
  await page.locator(".card", { hasText: "Logitech G Pro X Superlight" }).click();
  const button = page.locator('[role="dialog"]').getByRole("button", { name: "Demo listing — no real seller" });
  await expect(button).toBeDisabled();
});

// Full two-user flow against the live Supabase project. Needs
// supabase-chat-setup.sql applied and the dev server started with
// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY set. Opt in with CHAT_E2E=1.
const URL = process.env.VITE_SUPABASE_URL ?? "";
const KEY = process.env.VITE_SUPABASE_ANON_KEY ?? "";
const live = process.env.CHAT_E2E && URL && KEY ? test : test.skip;
const suffix = Date.now();
const password = "TempPass123!";

async function makeUser(tag: string) {
  const email = `chate2e_${tag}_${suffix}@nyx.local`;
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({ email, password });
  if (error || !data.session) throw error ?? new Error("no session");
  const username = `e2e_${tag}_${suffix}`.slice(0, 24);
  await client.from("profiles").upsert({ id: data.session.user.id, username });
  return { email, username, id: data.session.user.id, client };
}

async function signedInPage(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/");
  await menu(page, "Sign in / Sign up");
  const dialog = page.locator('[role="dialog"]');
  await dialog.locator('input[name="identifier"]').fill(email);
  await dialog.locator('input[name="password"]').fill(password);
  await dialog.getByRole("button", { name: "Sign in" }).click();
  await expectSignedIn(page, 20_000);
  return page;
}

live("messages to someone without a chat key are held, then delivered after they sign in", async ({ browser }) => {
  test.setTimeout(90_000);
  const seller = await makeUser("hs"); // never signs in through the app yet = no chat key
  const buyer = await makeUser("hb");
  const listingName = `E2E Held Keyboard ${suffix}`;
  const { data: listing, error } = await seller.client.from("listings").insert({ owner_id: seller.id, name: listingName, category: "Keyboards", price: 40, condition: "Good", image: "https://images.unsplash.com/photo-1587829741301-dc798b83add3", description: "e2e held test", seller: seller.username }).select().single();
  if (error) throw error;
  try {
    const buyerPage = await signedInPage(browser, buyer.email);
    await buyerPage.getByPlaceholder("Search gear...").fill(listingName);
    await buyerPage.locator(".card", { hasText: listingName }).click();
    await buyerPage.getByRole("button", { name: `Message ${seller.username}` }).click();
    const buyerChat = buyerPage.locator(".chat-window");
    await expect(buyerChat.getByText("hasn’t set up secure chat yet")).toBeVisible({ timeout: 15_000 });
    await buyerChat.getByLabel("Message", { exact: true }).fill("Held hello");
    await buyerChat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(buyerChat.locator(".bubble.held", { hasText: "Held hello" })).toContainText("Waiting to deliver");

    // Seller signs in (creating their key) and is told a message is on the way.
    const sellerPage = await signedInPage(browser, seller.email);
    await menu(sellerPage, /^Messages/);
    await sellerPage.locator(".inbox-list button", { hasText: listingName }).click();
    await expect(sellerPage.locator(".chat-window").getByText("before your secure chat was set up")).toBeVisible({ timeout: 15_000 });

    // Next time the buyer opens the chat, it is re-encrypted and delivered.
    await buyerChat.getByRole("button", { name: "Close" }).click();
    await menu(buyerPage, /^Messages/);
    await buyerPage.locator(".inbox-list button", { hasText: listingName }).click();
    await expect(buyerPage.locator(".chat-window .bubble.mine", { hasText: "Held hello" })).toBeVisible({ timeout: 15_000 });
    await expect(sellerPage.locator(".chat-window .bubble", { hasText: "Held hello" })).toBeVisible({ timeout: 15_000 });
  } finally {
    await seller.client.from("listings").delete().eq("id", listing.id);
  }
});

live("buyer and seller chat, negotiate, confirm, and share PayNow details", async ({ browser }) => {
  test.setTimeout(120_000);
  const seller = await makeUser("s");
  const buyer = await makeUser("b");
  const listingName = `E2E Chat Mouse ${suffix}`;
  const { data: listing, error } = await seller.client.from("listings").insert({ owner_id: seller.id, name: listingName, category: "Mouses", price: 90, condition: "Good", image: "https://images.unsplash.com/photo-1527814050087-3793815479db", description: "e2e chat test", seller: seller.username }).select().single();
  if (error) throw error;

  try {
    const sellerPage = await signedInPage(browser, seller.email);
    const buyerPage = await signedInPage(browser, buyer.email);

    // Buyer opens the listing and messages the seller.
    await buyerPage.getByPlaceholder("Search gear...").fill(listingName);
    await buyerPage.locator(".card", { hasText: listingName }).click();
    await buyerPage.getByRole("button", { name: `Message ${seller.username}` }).click();
    const buyerChat = buyerPage.locator(".chat-window");
    await buyerChat.getByLabel("Message", { exact: true }).fill("Hi, is this still available?");
    await buyerChat.getByRole("button", { name: "Send", exact: true }).click();
    await expect(buyerChat.locator(".bubble.mine", { hasText: "Hi, is this still available?" })).toBeVisible();

    // Seller sees the unread badge, opens the chat, and sends an offer.
    await expect(sellerPage.getByRole("button", { name: "Menu, 1 unread messages" })).toBeVisible({ timeout: 15_000 });
    await menu(sellerPage, "Messages, 1 unread");
    await sellerPage.locator(".inbox-list button", { hasText: listingName }).click();
    const sellerChat = sellerPage.locator(".chat-window");
    await expect(sellerChat.getByText("Hi, is this still available?")).toBeVisible();
    await sellerChat.getByPlaceholder("Price").fill("80");
    await sellerChat.getByRole("button", { name: "Send offer" }).click();

    // Buyer counters, live.
    await expect(buyerChat.locator(".offer-price", { hasText: "$80" })).toBeVisible({ timeout: 15_000 });
    await buyerChat.locator(".deal-bar input").fill("65");
    await buyerChat.getByRole("button", { name: "Counter-offer" }).click();

    // Both sides accept the counter, then both confirm after the countdown.
    await buyerChat.getByRole("button", { name: "Accept $65" }).click({ timeout: 15_000 });
    await sellerChat.getByRole("button", { name: "Accept $65" }).click({ timeout: 15_000 });
    const confirms = [sellerChat, buyerChat].map(chat => chat.getByRole("button", { name: /^Confirm deal/ }));
    for (const confirm of confirms) await expect(confirm).toHaveText(/Confirm deal \(\d\)/, { timeout: 15_000 }); // countdown running
    for (const confirm of confirms) await expect(confirm).toBeDisabled();
    for (const confirm of confirms) {
      await expect(confirm).toHaveText("Confirm deal", { timeout: 10_000 });
      await confirm.click();
    }
    await expect(buyerChat.getByText("Deal agreed at")).toBeVisible({ timeout: 15_000 });

    // Seller opens the payment side panel and shares a PayNow number.
    await sellerChat.getByRole("button", { name: "Proceed to payment" }).click();
    const panel = sellerChat.locator(".payment-panel");
    await panel.getByLabel("Phone number").check();
    await panel.getByLabel("PayNow mobile number").fill("9123 4567");
    await panel.getByRole("button", { name: "Send to buyer" }).click();

    // Buyer's payment panel opens beside the chat with the agreed amount.
    const buyerPanel = buyerChat.locator(".payment-panel");
    await expect(buyerPanel.getByText("+65 9123 4567")).toBeVisible({ timeout: 15_000 });
    await expect(buyerPanel.locator(".payment-summary")).toContainText("$65");
    await expect(buyerChat.locator(".chat-main")).toBeVisible();

    // The database only ever holds ciphertext.
    const { data: rows } = await seller.client.from("messages").select("ciphertext").limit(50);
    expect(rows!.length).toBeGreaterThan(0);
    for (const r of rows!) expect(atob(r.ciphertext)).not.toMatch(/still available|9123|"amount"/);

    // Reviews unlock for both as soon as payment details are sent.
    await buyerChat.getByRole("button", { name: "Leave a review" }).click({ timeout: 15_000 });
    await buyerChat.getByRole("radio", { name: "4 stars" }).click();
    await buyerChat.getByLabel("Comment (optional)").fill("Smooth deal, item as described.");
    await buyerChat.getByLabel("Post anonymously (your name won’t be shown)").check();
    await buyerChat.getByRole("button", { name: "Post", exact: true }).click();
    await expect(buyerChat.locator(".review-bar")).toContainText("You rated");
    await expect(buyerChat.getByRole("button", { name: "Add follow-up" })).toBeVisible();

    await sellerChat.getByRole("button", { name: "Leave a review" }).click({ timeout: 15_000 });
    await expect(sellerChat.getByText("Post anonymously")).toHaveCount(0); // sellers can't be anonymous
    await sellerChat.getByRole("radio", { name: "5 stars" }).click();
    await sellerChat.getByRole("button", { name: "Post", exact: true }).click();
    await expect(sellerChat.locator(".review-bar")).toContainText("You rated");
    await expect(sellerChat.getByRole("button", { name: "Add follow-up" })).toHaveCount(0);

    // The seller's rating shows on the listing card and detail, with the buyer hidden.
    await buyerPage.reload();
    await buyerPage.getByPlaceholder("Search gear...").fill(listingName);
    const card = buyerPage.locator(".card", { hasText: listingName });
    await expect(card.locator(".card-rating")).toHaveText("★ 4.0 (1)", { timeout: 15_000 });
    await card.click();
    await buyerPage.getByRole("button", { name: /^Sold by/ }).click();
    const reviewItem = buyerPage.locator(".review", { hasText: "Smooth deal" });
    await expect(reviewItem).toContainText("Anonymous buyer");
    await expect(reviewItem).not.toContainText(buyer.username);

    // The seller replies publicly from Settings.
    await sellerPage.locator(".chat-window").getByRole("button", { name: "Close" }).click();
    await menu(sellerPage, "Settings");
    const settings = sellerPage.getByRole("dialog", { name: "Account settings" });
    await settings.getByRole("button", { name: /As seller/ }).click();
    await settings.getByRole("button", { name: "Reply publicly" }).click();
    await settings.getByLabel("Your reply").fill("Thanks for buying!");
    await settings.getByRole("button", { name: "Post reply" }).click();
    await expect(settings.locator(".review-reply")).toContainText("Thanks for buying!");
    await expect(settings.getByLabel("Your reply")).toHaveCount(0); // form closes after posting
    await expect(settings.getByRole("button", { name: "Reply publicly" })).toHaveCount(0); // only one reply
  } finally {
    await seller.client.from("listings").delete().eq("id", listing.id);
  }
});
