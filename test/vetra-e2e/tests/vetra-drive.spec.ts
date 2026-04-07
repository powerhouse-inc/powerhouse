import { handleCookieConsent } from "@powerhousedao/e2e-utils";
import { expect, test } from "./helpers/fixtures.js";

test.describe.configure({ timeout: 60_000 });

test("should display Vetra drive automatically on Connect main page", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30_000 });

  const vetraDriveCard = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(vetraDriveCard).toBeVisible({ timeout: 30_000 });
});

test("should allow clicking on Vetra drive", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30_000 });

  const vetraDrive = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(vetraDrive).toBeVisible({ timeout: 30_000 });

  await vetraDrive.click();
  await page.waitForLoadState("networkidle");

  // Verify navigation to the drive page
  expect(page.url()).toContain("/d/");

  // Verify drive page content loaded
  const driveHeading = page.getByRole("heading", {
    name: "Vetra Studio Drive",
    level: 1,
  });
  await expect(driveHeading).toBeVisible({ timeout: 30_000 });
});
