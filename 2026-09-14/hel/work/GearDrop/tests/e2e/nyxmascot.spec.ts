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

test("doesn't reach for a cursor on the marketplace sliding over his section", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(1000);
  // Scroll until the marketplace card has slid a little over the pinned Ask Nyx section,
  // before Nyx starts his goodbye (so nothing else is stopping him from reaching).
  const at = await page.evaluate(async () => {
    const browse = document.querySelector<HTMLElement>("#browse")!, nyx = document.querySelector<HTMLElement>("#nyx")!;
    for (let y = 0; y < document.body.scrollHeight; y += 8) {
      scrollTo({ top: y });
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const top = browse.getBoundingClientRect().top, bottom = nyx.getBoundingClientRect().bottom;
      if (top < bottom - 25) return { top, bottom };
    }
    return null;
  });
  expect(at).not.toBeNull();
  await page.waitForTimeout(800);
  await expect(page.locator(".nyx-spot")).not.toHaveClass(/away/);
  const y = Math.round(at!.top + 12); // on the marketplace, but inside the Ask Nyx section's box
  expect(y).toBeLessThan(at!.bottom);
  expect(await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("main > .stack")?.id || document.elementFromPoint(x, y)?.closest("main > .stack")?.className, [500, y])).toContain("browse");
  await park(page, 500, y);
  await expect(reaching(page)).toHaveCount(0);
});
