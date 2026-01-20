import { handleCookieConsent } from "@powerhousedao/e2e-utils";
import { expect, test } from "./helpers/fixtures.js";

test("should display Vetra drive automatically on Connect main page", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  // Wait for the Vetra drive card to appear (default drives load asynchronously)
  const vetraDriveCard = page.getByText("Vetra Drive App");
  await expect(vetraDriveCard).toBeVisible({ timeout: 10000 });
});

test("should allow clicking on Vetra drive", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  const vetraDrive = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(vetraDrive).toBeVisible();

  await vetraDrive.click();

  await page.waitForLoadState("networkidle");

  const currentUrl = page.url();
  expect(currentUrl).not.toBe("http://localhost:3001/");
});
