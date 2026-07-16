import type { Page } from "@playwright/test";
import { expect, test } from "./helpers/fixtures.js";
import { DESCRIBE_TIMEOUT, LONG_VISIBLE_TIMEOUT } from "./helpers/timeouts.js";
import { waitForAppReady } from "./helpers/wait.js";

test.describe.configure({ timeout: DESCRIBE_TIMEOUT });

// No consent pre-seed here, so the banner always appears and its backdrop
// blocks clicks; handleCookieConsent's one-shot probe races the render.
async function dismissCookieBanner(page: Page): Promise<void> {
  const cookieButton = page.getByRole("button", {
    name: "Accept configured cookies",
  });
  await cookieButton.click({ timeout: 30_000 });
  await cookieButton.waitFor({ state: "hidden", timeout: 5_000 });
}

test("should display Vetra drive automatically on Connect main page", async ({
  page,
}) => {
  await page.goto("/");
  await waitForAppReady(page);

  await dismissCookieBanner(page);

  // Wait for the app skeleton to finish loading (skeleton-loader should be hidden)
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });

  // Wait for the Vetra drive card to appear (default drives load asynchronously)
  // Look for the h3 heading with "Vetra" which is the drive title
  const vetraDriveCard = page.getByRole("heading", {
    name: "Vetra",
    level: 3,
    exact: true,
  });
  await expect(vetraDriveCard).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });
});

test("should allow clicking on Vetra drive", async ({ page }) => {
  await page.goto("/");
  await waitForAppReady(page);

  await dismissCookieBanner(page);

  // Wait for the app skeleton to finish loading
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });

  const vetraDrive = page.getByRole("heading", {
    name: "Vetra",
    level: 3,
    exact: true,
  });
  await expect(vetraDrive).toBeVisible({ timeout: LONG_VISIBLE_TIMEOUT });

  await vetraDrive.click();

  await waitForAppReady(page);

  const currentUrl = page.url();
  expect(currentUrl).not.toBe("http://localhost:3001/");
});
