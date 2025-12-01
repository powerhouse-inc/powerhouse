import { handleCookieConsent } from "@powerhousedao/e2e-utils";
import { expect, test } from "./helpers/fixtures.js";

test("should display Vetra drive automatically on Connect main page", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  const vetraDriveHeading = page.getByRole("heading", {
    name: "Vetra",
    level: 3,
  });
  await expect(vetraDriveHeading).toBeVisible();

  const vetraDriveDescription = page.getByText("Vetra Drive App");
  await expect(vetraDriveDescription).toBeVisible();
});

test("should allow clicking on Vetra drive", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await handleCookieConsent(page);

  const vetraDrive = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(vetraDrive).toBeVisible();

  await vetraDrive.locator("..").click();

  await page.waitForLoadState("networkidle");

  const currentUrl = page.url();
  expect(currentUrl).not.toBe("http://localhost:3001/");
});
