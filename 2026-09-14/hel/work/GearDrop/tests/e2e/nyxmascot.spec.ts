import { expect, test } from "../offline/fixture";
import type { Page } from "@playwright/test";

// Nyx reaches for a cursor left still for 2 s, but only one over his own section.
test.use({ viewport: { width: 1536, height: 864 } }); // desktop: sections stack like cards

const reaching = (page: Page) => page.locator(".nyx-reach.reaching");

async function park(page: Page, x: number, y: number) {
  await page.mouse.move(x - 4, y - 4);
  await page.mouse.move(x, y);
  await page.waitForTimeout(3000); // REACH_AFTER (2 s) plus a margin
}

test("reaches for a still cursor inside the Ask Nyx section", async ({ page }) => {
  await page.goto("/");
  await page.locator("nav").getByRole("link", { name: "Ask Nyx" }).click();
  await page.waitForTimeout(1200);
  const box = (await page.locator("#nyx").boundingBox())!;
  await park(page, box.x + 200, box.y + 200);
  await expect(reaching(page)).toHaveCount(1);
});

test("doesn't reach after navigating to the marketplace", async ({ page }) => {
  await page.goto("/");
  await page.locator("nav").getByRole("link", { name: "Ask Nyx" }).click();
  await expect(page.locator("#nyx")).toBeInViewport();
  await page.getByRole("link", { name: "Browse", exact: true }).click();
  await expect(page.locator("#nyx")).toBeHidden();
  await park(page, 500, 200);
  await expect(reaching(page)).toHaveCount(0);
});
