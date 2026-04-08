import { expect, test } from "./helpers/fixtures.js";

test.describe.configure({ mode: "serial", timeout: 5 * 60 * 60 * 1000 });

test.use({
  storageState: {
    cookies: [],
    origins: [
      {
        origin: "http://localhost:3001",
        localStorage: [
          { name: "/:display-cookie-banner", value: "false" },
          {
            name: "/:acceptedCookies",
            value: '{"analytics":true,"marketing":false,"functional":false}',
          },
        ],
      },
    ],
  },
});

test("should not trigger a page reload when editing the manifest", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });

  // Click on the Vetra drive (exact match to avoid "Vetra Preview")
  const vetraDrive = page.getByRole("heading", {
    name: "Vetra",
    level: 3,
    exact: true,
  });
  await expect(vetraDrive).toBeVisible({ timeout: 2 * 60 * 60 * 1000 });
  await vetraDrive.click();
  await page.waitForLoadState("networkidle");

  // Verify we're on the drive page
  const driveHeading = page.getByRole("heading", {
    name: "Vetra Studio Drive",
    level: 1,
  });
  await expect(driveHeading).toBeVisible({ timeout: 2 * 60 * 60 * 1000 });

  // Create the package manifest by clicking the prompt
  const createManifest = page.getByText("Click to create package manifest");
  await expect(createManifest).toBeVisible({ timeout: 30000 });
  await createManifest.click();
  await page.waitForLoadState("networkidle");

  // Wait for the package editor to fully load
  const categorySelect = page.locator("select#package-category");
  await expect(categorySelect).toBeVisible({ timeout: 2 * 60 * 60 * 1000 });

  // Change the category select to trigger codegen (manifest regeneration)
  await categorySelect.selectOption("Governance");

  // Wait up to 5s for a reload event; treat timeout as "no reload"
  const reloaded = await page
    .waitForEvent("load", { timeout: 5000 })
    .then(() => true)
    .catch(() => false);

  expect(reloaded).toBe(false);
});
