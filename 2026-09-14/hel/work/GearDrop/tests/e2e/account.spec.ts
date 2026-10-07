import { expect, test } from "@playwright/test";

const suffix = Date.now();

test("sign up without an email, sign back in with the username, and see 'No email added' in Settings", async ({ page }) => {
  const username = `noemail_${suffix}`.slice(0, 24);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const auth = page.locator('[role="dialog"]').first();
  await auth.getByRole("button", { name: "Need an account? Sign up" }).click();
  await expect(auth.getByText("You can add one later in Settings.")).toBeVisible();
  await auth.locator('input[name="identifier"]').fill(username);
  await auth.locator('input[name="password"]').fill("TempPass123!");
  await auth.getByRole("button", { name: "Create account" }).click();
  await expect(auth).toHaveCount(0, { timeout: 15_000 });

  // Settings shows the username and that no email has been added.
  await page.locator("nav").getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Account settings" });
  await expect(settings.locator(".settings-list")).toContainText(username);
  await expect(settings.getByText("No email added")).toBeVisible();
  await expect(settings).not.toContainText("nyx.local");
  await settings.getByRole("button", { name: "Add email" }).click();
  await settings.getByLabel("Email").fill("not-an-email");
  await settings.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(settings.getByRole("alert")).toHaveText("Enter a valid email address.");
  await settings.getByRole("button", { name: "Close" }).click();

  // Log out and back in with just the username.
  await page.locator("nav").getByRole("button", { name: "Log out" }).click();
  await page.locator("nav").getByRole("button", { name: "Sign in" }).click();
  const signIn = page.locator('[role="dialog"]').first();
  await signIn.locator('input[name="identifier"]').fill(username);
  await signIn.locator('input[name="password"]').fill("TempPass123!");
  await signIn.getByRole("button", { name: "Sign in" }).click();
  await expect(signIn).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator("nav").getByRole("button", { name: "Settings" })).toBeVisible();
});

test("signing up with a username that's already taken says so", async ({ page }) => {
  const username = `taken_${suffix}`.slice(0, 24);
  for (const attempt of [1, 2]) {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    const auth = page.locator('[role="dialog"]').first();
    await auth.getByRole("button", { name: "Need an account? Sign up" }).click();
    await auth.locator('input[name="identifier"]').fill(username);
    await auth.locator('input[name="password"]').fill("TempPass123!");
    await auth.getByRole("button", { name: "Create account" }).click();
    if (attempt === 1) {
      await expect(auth).toHaveCount(0, { timeout: 15_000 });
      await page.locator("nav").getByRole("button", { name: "Log out" }).click();
    } else {
      await expect(auth.getByRole("alert")).toHaveText("That username is already taken.");
    }
  }
});

test("Remove email asks for confirmation and explains the link step", async ({ page }) => {
  const username = `rmemail_${suffix}`.slice(0, 24);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in" }).click();
  const auth = page.locator('[role="dialog"]').first();
  await auth.getByRole("button", { name: "Need an account? Sign up" }).click();
  await auth.locator('input[name="identifier"]').fill(username);
  await auth.locator('input[name="email"]').fill(`${username}@example.com`);
  await auth.locator('input[name="password"]').fill("TempPass123!");
  await auth.getByRole("button", { name: "Create account" }).click();
  await expect(auth).toHaveCount(0, { timeout: 15_000 });

  await page.locator("nav").getByRole("button", { name: "Settings" }).click();
  const settings = page.getByRole("dialog", { name: "Account settings" });
  await expect(settings.locator(".settings-list")).toContainText(`${username}@example.com`);
  await settings.getByRole("button", { name: "Remove email" }).click();
  await expect(settings.getByText("you can’t recover your account")).toBeVisible();
  await expect(settings.getByText(`we’ll send a link to ${username}@example.com`)).toBeVisible();
  // Signed in with a password, so the final "Yes, remove" step must not be offered yet.
  await expect(settings.getByRole("button", { name: "Yes, remove my email" })).toHaveCount(0);
  await settings.getByRole("button", { name: "Cancel" }).click();
  await expect(settings.getByRole("button", { name: "Remove email" })).toBeVisible();
});
