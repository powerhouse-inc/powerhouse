import { test, expect } from "./helpers/fixtures.js";

test.describe.configure({ timeout: 60_000 });

test("should load Vetra application successfully", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const title = await page.title();
  expect(title).toContain("Connect");
});

test("should verify basic page structure", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Verify the app skeleton finishes loading
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30_000 });

  // Verify the Vetra drive card is rendered
  const driveCard = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(driveCard).toBeVisible({ timeout: 30_000 });
});
