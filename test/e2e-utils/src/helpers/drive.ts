import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { handleCookieConsent } from "./cookie-consent.js";

/**
 * Helper function to create a local drive.
 * Navigates to root, handles cookie consent, and creates a new local drive.
 *
 * @param page - Playwright Page object
 * @param driveName - Name for the new drive
 *
 * @example
 * ```typescript
 * await createLocalDrive(page, "My Test Drive");
 * ```
 */
export async function createLocalDrive(page: Page, driveName: string) {
  // Navigate to URL
  await page.goto("/");

  // Wait for the app skeleton to finish loading
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });

  // Handle cookie consent
  await handleCookieConsent(page);

  const createDriveButton = page.getByText("Create New Drive");

  await expect(createDriveButton).toBeVisible({ timeout: 15000 });
  await createDriveButton.click();

  const form = page.locator('form[name="add-local-drive"]').last();
  const input = form.getByPlaceholder("Drive name");

  await input.fill(driveName);

  const submit = form
    .getByText("Create new drive")
    .and(page.locator("button[type=submit]"));
  await submit.click();
  await page.getByText(driveName).waitFor({ state: "visible", timeout: 5000 });
}
