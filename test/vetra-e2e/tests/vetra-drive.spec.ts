import { handleCookieConsent } from "@powerhousedao/e2e-utils";
import { expect, test } from "./helpers/fixtures.js";

test("should display Vetra drive automatically on Connect main page", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  // Wait for the app skeleton to finish loading (skeleton-loader should be hidden)
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });

  // Wait for the Vetra drive card to appear (default drives load asynchronously)
  // Look for the h3 heading with "Vetra" which is the drive title
  const vetraDriveCard = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(vetraDriveCard).toBeVisible({ timeout: 15000 });
});

test("should allow clicking on Vetra drive", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  // Wait for the app skeleton to finish loading
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });

  const vetraDrive = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(vetraDrive).toBeVisible({ timeout: 15000 });

  await vetraDrive.click();

  await page.waitForLoadState("networkidle");

  const currentUrl = page.url();
  expect(currentUrl).not.toBe("http://localhost:3001/");
});
