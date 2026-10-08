import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// The ☰ menu (logged out): what's in it, how it closes, and an axe pass while open.
test.use({ reducedMotion: "reduce" });

test("top bar keeps only the essentials; the ☰ menu holds the rest", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("nav");
  await expect(nav.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Privacy & Safety" })).toHaveCount(0);

  const toggle = nav.getByRole("button", { name: "Menu" });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panel = page.locator("#nav-menu-panel");
  await expect(panel.getByRole("link", { name: "Home" })).toBeFocused();
  await expect(panel.getByRole("button", { name: "Sign in / Sign up" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Privacy & Safety" })).toBeVisible();
  await expect(panel.getByRole("button", { name: /Messages|Settings|Log out/ })).toHaveCount(0);

  const results = await new AxeBuilder({ page }).include("nav").analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(toggle).toBeFocused();

  await toggle.click();
  await page.locator("h1").click();
  await expect(panel).toHaveCount(0);

  await toggle.click();
  await panel.getByRole("button", { name: "Sign in / Sign up" }).click();
  await expect(page.locator('[role="dialog"]').first()).toBeVisible();
  await expect(panel).toHaveCount(0);
});

test("menu works on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.locator("nav").getByRole("button", { name: "Menu" }).click();
  await expect(page.locator("#nav-menu-panel").getByRole("link", { name: "Privacy & Safety" })).toBeVisible();
});

test("sign in opens from the menu on the Privacy & Safety page too", async ({ page }) => {
  await page.goto("/");
  await page.locator("nav").getByRole("button", { name: "Menu" }).click();
  await page.locator("#nav-menu-panel").getByRole("link", { name: "Privacy & Safety" }).click();
  await expect(page.locator(".safety-page")).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Menu" }).click();
  await page.locator("#nav-menu-panel").getByRole("button", { name: "Sign in / Sign up" }).click();
  await expect(page.locator('[role="dialog"]').first()).toBeVisible();
});

test("Home in the menu returns from Privacy & Safety to the marketplace top", async ({ page }) => {
  await page.goto("/#privacy-safety-questions");
  await expect(page.locator(".safety-page")).toBeVisible();
  await page.locator("nav").getByRole("button", { name: "Menu" }).click();
  await page.locator("#nav-menu-panel").getByRole("link", { name: "Home" }).click();
  await expect(page.locator(".hero")).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(5);
});
