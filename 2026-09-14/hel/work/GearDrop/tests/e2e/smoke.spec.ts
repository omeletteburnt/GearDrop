import { expect, test } from "@playwright/test";

// Baseline smoke test proving the E2E harness itself works end to end
// (dev server boot, page load, core landmarks render). The two critical
// flows named in the test plan (browse -> detail -> compare, and
// sign-up -> create listing -> delete) are full-coverage work for
// Phase 11, once the UI has stable selectors to target after the
// design-system rollout.
test("home page loads with the marketplace and Nyx sections", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/GearDrop/);
  await expect(page.locator("nav .brand")).toBeVisible();
  await expect(page.locator("#browse")).toBeVisible();
  await expect(page.locator("#nyx")).toBeVisible();
});
