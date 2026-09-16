import { expect, test } from "@playwright/test";

test.describe("detail sheet accessibility", () => {
  test("locks body scroll, traps focus, and closes on Escape", async ({ page }) => {
    await page.goto("/");
    await page.locator(".card").first().click();

    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();

    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await expect.poll(() => page.evaluate(() => {
      const el = document.querySelector('[role="dialog"]');
      return el ? el.contains(document.activeElement) : false;
    })).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe("");
  });

  test("clicking the backdrop closes the sheet", async ({ page }) => {
    await page.goto("/");
    await page.locator(".card").first().click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible();

    await page.locator(".overlay").click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
  });
});
