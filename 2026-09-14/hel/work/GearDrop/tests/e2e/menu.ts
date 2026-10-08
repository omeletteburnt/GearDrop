import type { Page } from "@playwright/test";

// Account, messages and settings live in the ☰ menu: open it, then pick an item.
export async function menu(page: Page, item: string | RegExp) {
  const toggle = page.locator("nav .nav-menu-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#nav-menu-panel").getByRole("button", { name: item }).click();
}

export async function logOut(page: Page) {
  await menu(page, "Log out account");
  await page.locator("#nav-menu-panel").getByRole("button", { name: "Log out", exact: true }).click();
}

// Signed-in check: the menu offers "Log out account" (closes the menu again).
export async function expectSignedIn(page: Page, timeout = 10_000) {
  const toggle = page.locator("nav .nav-menu-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.locator("#nav-menu-panel").getByRole("button", { name: "Log out account" }).waitFor({ timeout });
  await page.keyboard.press("Escape");
}
