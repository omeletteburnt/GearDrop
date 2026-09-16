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
  await authDialog.locator('input[name="username"]').fill(`shortpw_${suffix}`);
  await authDialog.locator('input[name="password"]').fill("abc");
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog.getByRole("alert")).toHaveText(/at least 6 characters/i);
  await expect(authDialog).toBeVisible(); // did not silently vanish or hang

  // Editing a field should clear the stale error instead of leaving it stuck.
  await authDialog.locator('input[name="password"]').fill("LongEnough123!");
  await expect(authDialog.getByRole("alert")).toHaveCount(0);
});

test("stale error clears on browser autofill, not just manual typing", async ({ page }) => {
  // Browser/password-manager autofill sets an input's value via the native
  // setter without dispatching the events React's onChange listens for, so
  // a naive onChange-only clear leaves a stale error on screen even though
  // the field now holds a valid value. Playwright can't trigger real browser
  // autofill, so this reproduces the exact mechanism: set the value the way
  // autofill does (native setter, no input/change event), then fire the
  // animationstart event our CSS-based autofill-detection hook listens for
  // (see tokens.css's :-webkit-autofill keyframe), and confirm it recovers.
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.locator('[role="dialog"]').first();
  await authDialog.getByRole("button", { name: "Need an account? Sign up" }).click();
  await authDialog.locator('input[name="username"]').fill(`autofilltest_${suffix}`);
  await authDialog.locator('input[name="password"]').fill("abc");
  await authDialog.getByRole("button", { name: "Create account" }).click();
  await expect(authDialog.getByRole("alert")).toHaveText(/at least 6 characters/i);

  await page.evaluate(() => {
    const input = document.querySelector('input[name="password"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "AutofilledPassword123!");
    input.dispatchEvent(new AnimationEvent("animationstart", { animationName: "autofill-detect", bubbles: true }));
  });
  await expect(authDialog.getByRole("alert")).toHaveCount(0);
});

test("sign-up -> create a listing -> delete it", async ({ page }) => {
  const username = `e2e_flow_${suffix}`;

  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const authDialog = page.locator('[role="dialog"]').first();
  await authDialog.getByRole("button", { name: "Need an account? Sign up" }).click();
  await authDialog.locator('input[name="username"]').fill(username);
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
