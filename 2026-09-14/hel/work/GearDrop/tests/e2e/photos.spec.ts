import { expect, test, type Page } from "@playwright/test";
import { menu } from "./menu";
import { png } from "./png";

// The sell form's photo picker. Uploads to storage are faked here (the
// listing-photos bucket may not exist yet); the account is a real sign-up.
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
async function signUpAndOpenSell(page: Page, tag: string) {
  const username = `e2e_ph${tag}_${suffix}`;
  await page.goto("/");
  await menu(page, "Sign in / Sign up");
  const auth = page.locator('[role="dialog"]').first();
  await auth.getByRole("button", { name: "Need an account? Sign up" }).click();
  await auth.locator('input[name="identifier"]').fill(username);
  await auth.locator('input[name="email"]').fill(`${username}@example.com`);
  await auth.locator('input[name="password"]').fill("TempPass123!");
  await auth.getByRole("button", { name: "Create account" }).click();
  await expect(auth).toHaveCount(0, { timeout: 10000 });
  await page.getByRole("button", { name: "+ Sell gear" }).click();
  return page.getByRole("dialog", { name: "Create a listing" });
}

test("sell form: photos are required, upload with previews, reorder, max 5, and are cleaned up on close", async ({ page }) => {
  const uploads: string[] = [], removed: string[] = [];
  await page.route("**/storage/v1/object/listing-photos/**", async route => {
    uploads.push(route.request().url());
    await new Promise(r => setTimeout(r, 300));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "ok" }) });
  });
  await page.route("**/storage/v1/object/listing-photos", async route => { // remove(): DELETE with the paths in the body
    if (route.request().method() === "DELETE") removed.push(...(route.request().postDataJSON()?.prefixes ?? []));
    await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  });

  const sell = await signUpAndOpenSell(page, "a");
  await expect(sell.getByText("0/5")).toBeVisible();
  await expect(sell.getByLabel("Choose photos")).toBeHidden(); // no plain "Choose Files" button, just the tile
  await expect(sell.getByRole("button", { name: /add photos/i })).toBeVisible();

  // can't publish without a photo
  await sell.locator('input[name="name"]').fill("Photo test mouse");
  await sell.locator('input[name="price"]').fill("20");
  await sell.locator('textarea[name="description"]').fill("Testing photos.");
  await sell.locator('input[name="details"]').fill("none");
  await sell.getByRole("button", { name: /publish listing/i }).click();
  await expect(sell.getByRole("alert")).toHaveText("Add at least one photo of your item.");

  // two photos: previews, uploading, cover tag on the first
  const picker = sell.getByLabel("Choose photos");
  await picker.setInputFiles([png("red.png", "ff0000"), png("blue.png", "0000ff")]);
  await expect(sell.locator(".photo-shot")).toHaveCount(2);
  await expect(sell.getByText("2/5")).toBeVisible();
  await expect(sell.locator(".photo-shot.busy")).toHaveCount(0, { timeout: 5000 });
  expect(uploads).toHaveLength(2);
  const first = await sell.locator(".photo-shot img").first().getAttribute("src");
  await expect(sell.locator(".photo-shot").first().locator(".cover-tag")).toBeVisible();

  await sell.locator(".photo-picker").screenshot({ path: "shots/listing-photos/1-sell-form-photos.png" });
  // reorder: the second becomes the cover
  await sell.getByRole("button", { name: "Move photo 2 earlier" }).click();
  expect(await sell.locator(".photo-shot img").nth(1).getAttribute("src")).toBe(first);

  // max 5: picking 4 more only adds 3
  await picker.setInputFiles(["a", "b", "c", "d"].map(n => png(`${n}.png`, "00ff00")));
  await expect(sell.locator(".photo-shot")).toHaveCount(5);
  await expect(sell.getByText("Only 5 photos per listing.")).toBeVisible();
  await expect(sell.locator(".photo-add")).toHaveCount(0);

  // remove one, and that upload is deleted from storage straight away
  await expect(sell.locator(".photo-shot.busy")).toHaveCount(0, { timeout: 5000 });
  await sell.getByRole("button", { name: "Remove photo 5" }).click();
  await expect(sell.locator(".photo-shot")).toHaveCount(4);
  await expect.poll(() => removed.length).toBe(1);

  // closing without publishing cleans up the other 4
  await sell.getByRole("button", { name: "Close" }).click();
  await expect(sell).toHaveCount(0);
  await expect.poll(() => removed.length).toBe(5);
  expect(new Set(removed).size).toBe(5);
});

test("sell form rejects files that aren't photos", async ({ page }) => {
  const sell = await signUpAndOpenSell(page, "b");
  await sell.getByLabel("Choose photos").setInputFiles([{ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") }]);
  await expect(sell.getByText("notes.txt isn't a photo.")).toBeVisible();
  await expect(sell.locator(".photo-shot")).toHaveCount(0);
});
