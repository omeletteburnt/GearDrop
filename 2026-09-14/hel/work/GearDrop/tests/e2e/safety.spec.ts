import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ reducedMotion: "reduce" });

test("Privacy & Safety page is organised into security, privacy, tips and Q&A", async ({ page }) => {
  await page.goto("/#privacy-safety");
  for (const h of ["How GearDrop keeps you secure", "What we can and can't see", "Trade safely, step by step", "Questions, answered.", "Spotted something wrong?"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible();
  for (const topic of ["Buying & selling", "Paying", "Chats & privacy", "Staying safe"])
    await expect(page.getByRole("heading", { name: topic, level: 3 })).toBeVisible();

  // Jump buttons scroll within the page and never switch back to the marketplace.
  await page.getByRole("navigation", { name: "On this page" }).getByRole("button", { name: "Q&A" }).click();
  await expect(page.locator("#safety-questions")).toBeInViewport();
  await expect(page.locator(".safety-page")).toBeVisible();
});

test("the old Q&A link still lands on the questions", async ({ page }) => {
  await page.goto("/#privacy-safety-questions");
  await expect(page.locator("#safety-questions")).toBeInViewport();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`Privacy & Safety passes axe — ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/#privacy-safety");
    await page.locator("details").first().click(); // include an opened answer
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
}
