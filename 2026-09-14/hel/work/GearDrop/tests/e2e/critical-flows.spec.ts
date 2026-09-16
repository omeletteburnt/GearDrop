import { expect, test } from "@playwright/test";

const suffix = Date.now();

test("browse -> detail -> compare two models in the same category", async ({ page }) => {
  await page.goto("/");

  // Open the first mouse listing's detail sheet from the browse grid.
  await page.locator(".card", { hasText: "Logitech G Pro X Superlight" }).click();
  const detail = page.locator('[role="dialog"]').first();
  await expect(detail).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Logitech G Pro X Superlight" })).toBeVisible();

  // Select it for comparison, then close and pick a second Mouses listing.
  await detail.getByRole("button", { name: /compare models/i }).click();
  await expect(detail).toHaveCount(0);

  await page.locator(".card", { hasText: "Logitech G305 Lightspeed" }).click();
  const detail2 = page.locator('[role="dialog"]').first();
  await detail2.getByRole("button", { name: /compare models/i }).click();

  // The compare workspace should now render both models side by side.
  const workspace = page.locator(".compare-workspace");
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText("Logitech G Pro X Superlight")).toBeVisible();
  await expect(workspace.getByText("Logitech G305 Lightspeed")).toBeVisible();

  // Clearing the comparison should reset back to the empty state.
  await page.getByRole("button", { name: "Clear comparison" }).click();
  await expect(page.locator(".compare-empty")).toBeVisible();
});

test("sign-up shows clear validation errors instead of silently doing nothing", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.locator('[role="dialog"]').first();
  await authDialog.getByRole("button", { name: "Need an account? Sign up" }).click();

  // A too-short password used to be silently blocked by the native minLength
  // constraint, leaving the dialog looking unchanged with no feedback at all.
  await authDialog.locator('input[name="identifier"]').fill(`shortpw_${suffix}`);
  await authDialog.locator('input[name="email"]').fill(`shortpw_${suffix}@example.com`);
  await authDialog.locator('input[name="password"]').fill("abc");
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog.getByRole("alert")).toHaveText(/at least 12 characters/i);
  await expect(authDialog).toBeVisible(); // did not silently vanish or hang

  // Editing a field should clear the stale error instead of leaving it stuck.
  await authDialog.locator('input[name="password"]').fill("LongEnough123!");
  await expect(authDialog.getByRole("alert")).toHaveCount(0);
});

test("stale error clears even when the field changes with zero JS events", async ({ page }) => {
  // Browser autofill, password managers, and "suggest a strong password"
  // all set an input's value in ways that don't reliably fire any single
  // event type React can hook into — and a CSS-animation-based detection
  // trick (tried previously) only fires once per field, so a *second*
  // silent change (e.g. a password suggestion filled through a different
  // path than the email autofill) still leaves a stale error stuck. The
  // fix polls the form's live values instead of depending on any event at
  // all, so this test reproduces the worst case directly: change the value
  // via the native setter and dispatch NOTHING — no input, change, or
  // animation event whatsoever — and confirm the stale error still clears.
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.locator('[role="dialog"]').first();
  await authDialog.getByRole("button", { name: "Need an account? Sign up" }).click();
  await authDialog.locator('input[name="identifier"]').fill(`autofilltest_${suffix}`);
  await authDialog.locator('input[name="email"]').fill(`autofilltest_${suffix}@example.com`);
  await authDialog.locator('input[name="password"]').fill("abc");
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog.getByRole("alert")).toHaveText(/at least 12 characters/i);

  await page.evaluate(() => {
    const input = document.querySelector('input[name="password"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "AutofilledPassword123!");
    // Deliberately no dispatchEvent call of any kind.
  });
  await expect(authDialog.getByRole("alert")).toHaveCount(0, { timeout: 2000 });
});

test("sign-up -> create a listing -> delete it", async ({ page }) => {
  const username = `e2e_flow_${suffix}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.locator('[role="dialog"]').first();
  await authDialog.getByRole("button", { name: "Need an account? Sign up" }).click();
  await authDialog.locator('input[name="identifier"]').fill(username);
  await authDialog.locator('input[name="email"]').fill(`${username}@example.com`);
  await authDialog.locator('input[name="password"]').fill("TempPass123!");
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog).toHaveCount(0, { timeout: 10000 });

  await page.getByRole("button", { name: "+ Sell gear" }).click();
  const sellDialog = page.locator('[role="dialog"]').first();
  const listingName = `E2E Test Listing ${suffix}`;
  await sellDialog.locator('input[name="seller"]').fill(username);
  await sellDialog.locator('input[name="name"]').fill(listingName);
  await sellDialog.locator('select[name="category"]').selectOption("Mics");
  await sellDialog.locator('input[name="price"]').fill("25");
  await sellDialog.locator('textarea[name="description"]').fill("A listing created by an automated end-to-end test.");
  await sellDialog.locator('input[name="details"]').fill("Automated test, no real specs.");
  await sellDialog.getByRole("button", { name: /publish listing/i }).click();
  await expect(sellDialog).toHaveCount(0, { timeout: 10000 });

  const newCard = page.locator(".card", { hasText: listingName });
  await expect(newCard).toBeVisible();
  await newCard.click();

  const detail = page.locator('[role="dialog"]').first();
  await detail.getByRole("button", { name: "Delete listing" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete listing confirmation" });
  await confirm.getByRole("button", { name: "Yes" }).click();

  await expect(page.locator(".card", { hasText: listingName })).toHaveCount(0);
  await expect(page.locator(".toast")).toHaveText(/removed/i);
});

test("sign up with a real email, then sign back in using that email", async ({ page }) => {
  const username = `emailflow_${suffix}`;
  const email = `${username}@example.com`;

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.locator('[role="dialog"]').first();
  await authDialog.getByRole("button", { name: "Need an account? Sign up" }).click();
  await authDialog.locator('input[name="identifier"]').fill(username);
  await authDialog.locator('input[name="email"]').fill(email);
  await authDialog.locator('input[name="password"]').fill("TempPass123!");
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  const signInDialog = page.locator('[role="dialog"]').first();
  await signInDialog.locator('input[name="identifier"]').fill(email);
  await signInDialog.locator('input[name="password"]').fill("TempPass123!");
  await signInDialog.getByRole("button", { name: "Sign in" }).click();
  await expect(signInDialog).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});

// This requires the public.email_for_username() Postgres function (see
// supabase-email-lookup.sql) to already be applied to the live database —
// this session has no DB write access to run it. If this test fails with
// "No account found with that username or email," that SQL likely hasn't
// been run yet, not an app bug.
test("sign up, then sign back in using the username instead of email", async ({ page }) => {
  const username = `userflow_${suffix}`;
  const email = `${username}@example.com`;

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.locator('[role="dialog"]').first();
  await authDialog.getByRole("button", { name: "Need an account? Sign up" }).click();
  await authDialog.locator('input[name="identifier"]').fill(username);
  await authDialog.locator('input[name="email"]').fill(email);
  await authDialog.locator('input[name="password"]').fill("TempPass123!");
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog).toHaveCount(0, { timeout: 10000 });

  await page.getByRole("button", { name: "Log out" }).click();
  await page.getByRole("button", { name: "Sign in" }).click();
  const signInDialog = page.locator('[role="dialog"]').first();
  await signInDialog.locator('input[name="identifier"]').fill(username);
  await signInDialog.locator('input[name="password"]').fill("TempPass123!");
  await signInDialog.getByRole("button", { name: "Sign in" }).click();
  await expect(signInDialog).toHaveCount(0, { timeout: 10000 });
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
});
