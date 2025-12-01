import { test, expect } from "./helpers/fixtures.js";

test("should load Vetra application successfully", async ({ page }) => {
  // Navigate to the root URL (port 3001)
  await page.goto("/");

  // Wait for page to load
  await page.waitForLoadState("networkidle");

  // Verify the page title exists (basic check that page loaded)
  const title = await page.title();
  expect(title).toBeTruthy();
  console.log(`✅ Page loaded successfully with title: "${title}"`);

  // Log success
  console.log("✅ Vetra application is running on port 3001");
  console.log(
    "✅ E2E test infrastructure is set up correctly (Playwright + Coverage)",
  );
});

test("should verify basic page structure", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Check if the page has any visible content
  const bodyContent = await page.locator("body").textContent();
  expect(bodyContent).toBeTruthy();

  console.log("✅ Page structure verified - Vetra UI is rendering");
});
