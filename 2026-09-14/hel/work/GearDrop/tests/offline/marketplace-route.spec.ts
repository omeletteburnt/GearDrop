import { expect, mockMarketplace, test } from "./fixture";

for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 812 }]) {
  test(`marketplace navigation and comparison at ${viewport.width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockMarketplace(page, true);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/");
    const nav = await page.locator("main>nav").elementHandle();
    const picks = page.locator(".hero").getByRole("region", { name: "Check these out!" });
    await expect(picks.getByRole("article")).toHaveCount(3);
    const picksBox = await picks.boundingBox();
    expect(picksBox!.x + picksBox!.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator("#nyx")).toHaveCount(1);
    await page.getByLabel("Ask Nyx anything").fill("A draft to keep");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(page.locator("#browse")).toBeHidden();
    await page.getByRole("link", { name: /Explore the drop/ }).click();
    await expect(page).toHaveURL("/marketplace");
    await expect(page.getByRole("heading", { name: "Browse the marketplace" })).toBeVisible();
    expect(await nav!.evaluate(el => el === document.querySelector("main>nav"))).toBe(true);

    await page.goBack();
    await expect(page.locator(".hero")).toBeVisible();
    await expect(page.getByLabel("Ask Nyx anything")).toHaveValue("A draft to keep");
    const invite = page.getByRole("region", { name: "Take a look at the marketplace!" });
    await expect(invite.getByText("The Marketplace ✦", { exact: true })).toBeVisible();
    await expect(invite).toContainText("Desirable equipment is waiting for you. Snatch those deals!");
    await invite.getByRole("link", { name: "Browse marketplace" }).click();
    await expect(page).toHaveURL("/marketplace");
    await expect(page.getByRole("heading", { name: "Browse the marketplace" })).toBeVisible();
    await page.goBack();
    await expect(page.locator(".hero")).toBeVisible();
    await page.locator(".categories").getByRole("link", { name: /Mouses/ }).click();
    await expect(page).toHaveURL("/marketplace?category=Mouses");
    const mouseFilter = page.getByRole("button", { name: "Mouses", exact: true });
    await expect(mouseFilter).toHaveAttribute("aria-pressed", "true");
    await page.goBack();
    await expect(page.locator(".hero")).toBeVisible();
    await page.goForward();
    await expect(mouseFilter).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(mouseFilter).toHaveAttribute("aria-pressed", "true");
    const search = page.getByRole("textbox", { name: "Search gear" });
    await search.fill("G305");
    await expect(page.locator(".card")).toHaveCount(1);
    await search.clear();

    const dialog = page.getByRole("dialog");
    await page.getByRole("button", { name: /View Logitech G Pro X Superlight,/ }).click();
    await dialog.getByRole("button", { name: "Compare models", exact: true }).click();
    await expect(page.locator(".compare-empty")).toContainText("Logitech G Pro X Superlight selected");
    await page.getByRole("button", { name: "Keyboards", exact: true }).click();
    await expect(page).toHaveURL("/marketplace?category=Keyboards");
    await page.locator(".card").first().click();
    await expect(dialog.getByRole("button", { name: "Choose another Mouses model" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await mouseFilter.click();
    await page.getByRole("button", { name: /View Logitech G305 Lightspeed,/ }).click();
    await dialog.getByRole("button", { name: /Compare models with selected/ }).click();
    await expect(dialog).toHaveCount(0);
    const heading = page.getByRole("heading", { name: "Want to compare models?" });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(page.locator(".compare-head").last()).toBeInViewport({ ratio: 1 });
    expect((await page.locator("main>nav").boundingBox())?.y).toBe(0);
    const comparison = page.locator(".compare-workspace");
    await expect(comparison).toContainText("Logitech G Pro X Superlight");
    await expect(comparison).toContainText("Logitech G305 Lightspeed");
    await page.screenshot({ path: testInfo.outputPath("comparison.png") });
    const request = page.waitForRequest(r => r.url().includes("/functions/v1/nyx"));
    await comparison.getByRole("textbox", { name: "Your question" }).fill("Which is better for FPS?");
    await comparison.getByRole("button", { name: "Ask Nyx →", exact: true }).click();
    expect((await request).postDataJSON()).toMatchObject({ mode: "compare", focusIds: [expect.any(Number), expect.any(Number)] });
    await expect(comparison).toContainText("Here are options for your setup.");
    await comparison.getByRole("button", { name: "Clear comparison" }).click();
    await expect(page.locator(".compare-empty")).toHaveText("No models selected yet.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    expect(errors).toEqual([]);
  });
}

test("route animation reverses on return and skips reduced motion", async ({ page }) => {
  await page.goto("/");
  const browse = page.getByRole("link", { name: "Browse", exact: true });
  const home = page.locator(".brand");
  for (const [link, animationName] of [[browse, "route-in-left"], [home, "route-in-right"]] as const) {
    await link.click();
    const animationStarted = () => page.evaluate(name => document.getAnimations().some(
      animation => (animation as CSSAnimation).animationName === name,
    ), animationName);
    await expect.poll(animationStarted, { intervals: [15, 25, 40] }).toBe(true);
    await expect.poll(animationStarted).toBe(false);
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    document.startViewTransition = () => { throw new Error("Reduced motion started a transition"); };
  });
  await browse.click();
  await expect(page.getByRole("heading", { name: "Browse the marketplace" })).toBeVisible();
});

test("suggested listings float into view and lift on hover or focus", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const card = page.getByRole("region", { name: "Check these out!" }).getByRole("article").first();
  await expect(card).toHaveAttribute("data-float", "true");
  await expect(card).toHaveCSS("animation-duration", "4s");
  await expect(card).toHaveCSS("animation-iteration-count", "1");

  await card.hover();
  await expect(card).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -9)");
  await expect(card.locator("img")).toHaveCSS("scale", "1.06");
  await page.mouse.move(0, 0);
  await card.getByRole("link").focus();
  await expect(card).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, -9)");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(card).toHaveCSS("animation-name", "none");
  await expect(card).toHaveCSS("transform", "none");
});

test("the background photos loop the requested bass rhythm and respect reduced motion", async ({ page }) => {
  await page.goto("/");
  const hero = page.locator(".hero");
  const photos = hero.locator(".hero-strips");
  const rhythm = ". . . . ... . . . .. . . . ";
  const beat = await photos.evaluate((layer, length) => {
    const animation = layer.getAnimations().find(animation => animation.id === "hero-photo-bass")!;
    const effect = animation.effect as KeyframeEffect;
    const duration = effect.getComputedTiming().duration as number;
    const frames = effect.getKeyframes();
    return {
      firstPeakMs: frames[1].computedOffset * duration,
      firstReturnMs: frames[2].computedOffset * duration,
      pulses: frames.filter(frame => frame.scale === "1.025")
        .map(frame => Math.floor(frame.computedOffset * length)),
      duration: effect.getTiming().duration,
      loops: effect.getTiming().iterations === Infinity,
    };
  }, rhythm.length);
  expect(beat.pulses).toEqual([...rhythm].flatMap((slot, index) => slot === "." ? [index] : []));
  expect(beat.duration).toBe(rhythm.length * 280);
  expect(beat.firstPeakMs).toBeCloseTo(14);
  expect(beat.firstReturnMs).toBeCloseTo(84);
  expect(beat.loops).toBe(true);
  await expect(hero.locator(".orbs")).toHaveCSS("scale", "none");
  await expect(hero.locator("h1")).toHaveCSS("scale", "none");
  expect(await hero.evaluate(element => getComputedStyle(element, "::after").animationName)).toBe("wind-flow");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => photos.evaluate(layer => layer.getAnimations()
    .some(animation => animation.id === "hero-photo-bass"))).toBe(false);
  await expect(photos).toHaveCSS("scale", "none");
});

test("a homepage suggestion deep-links to its exact listing after the marketplace transition", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const startTransition = document.startViewTransition.bind(document);
    document.startViewTransition = (...args) => {
      const transition = startTransition(...args);
      void transition.finished.then(() => {
        document.documentElement.dataset.listingTransition =
          document.querySelector(".detail") ? "opened early" : "finished";
      });
      return transition;
    };
  });

  const name = "Seller's mouse";
  const suggestion = page.getByRole("region", { name: "Check these out!" })
    .getByRole("link", { name: `View listing for ${name}`, exact: true });
  const href = await suggestion.getAttribute("href");
  expect(href).toMatch(/^\/marketplace\?listing=listing%3A\d+$/);
  const details = page.getByRole("dialog", { name, exact: true });

  await suggestion.click();
  await expect(page).toHaveURL(href!);
  await expect(page.locator("html")).toHaveAttribute("data-listing-transition", "finished");
  await expect(details).toBeVisible();
  await expect(details.getByRole("button", { name: "Close", exact: true })).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(details).toBeHidden();
  await expect(suggestion).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(href!);
  await expect(details).toBeVisible();

  await page.reload();
  await expect(details).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(details).toBeHidden();
  await expect(page).toHaveURL("/marketplace");
  await expect(page.getByRole("heading", { name: "Browse the marketplace" })).toBeFocused();
});

test("a listing deep link can fetch an older listing directly by ID", async ({ page }) => {
  await page.route("**/rest/v1/listings?*", async route => {
    if (new URL(route.request().url()).searchParams.has("id")) await route.fallback();
    else await route.fulfill({
      json: [],
      headers: { "access-control-allow-origin": "*" },
    });
  });
  await page.goto("/marketplace?listing=listing%3A502");
  await expect(page.getByRole("dialog", { name: "Other seller's mouse", exact: true })).toBeVisible();
});
