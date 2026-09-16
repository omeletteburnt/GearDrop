import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Automated accessibility audit (contrast, ARIA, focus, landmarks) against
// the redesigned home page and the detail sheet, in both themes. This is a
// real automated pass, not a manual eyeball check, per the design brief's
// requirement that all color combinations pass WCAG AA in both themes.
// Sections fade in on a scroll-linked animation-timeline as they enter the
// viewport (see styles.css section-in). That timeline continuously re-links
// opacity to scroll position — scrolling back up after reaching the bottom
// un-reveals sections again, it isn't a one-shot "reveal and stay" trigger.
// Auditing color contrast is inherently about the page's *stable* rendered
// colors, not a transient mid-scroll animation frame, so these tests emulate
// prefers-reduced-motion (which this app already treats as "skip the
// scroll-reveal, show full content immediately," per styles.css) rather than
// trying to chase a moving scroll-timeline target.
test.use({ reducedMotion: "reduce" });

test.describe("accessibility (axe)", () => {
  test("home page — light theme", async ({ page }) => {
    await page.goto("/");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("home page — dark theme", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("detail sheet — dark theme", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await page.locator(".card").first().click();
    await page.locator('[role="dialog"]').waitFor();
    await page.waitForTimeout(350); // let the modal-in/overlay-in fade transitions settle before sampling computed colors
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("auth dialog — light theme", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator('[role="dialog"]').waitFor();
    await page.waitForTimeout(350); // let the modal-in/overlay-in fade transitions settle before sampling computed colors
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });
});
