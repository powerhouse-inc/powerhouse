import { type Page } from "@playwright/test";
import { CONNECT_URL } from "../../playwright.config.js";
import { handleCookieConsent } from "./cookie-consent.js";
/**
 * Helper function to navigate into a folder and verify it's visible
 * @param page Playwright Page object
 * @param folderName Name of the folder to navigate into
 */
export async function createLocalDrive(page: Page, driveName: string) {
  // Navigate to URL
  await page.goto(CONNECT_URL);

  // Handle cookie consent
  await handleCookieConsent(page);

  await page.click(`text=Create New Drive`);
  const input = page.getByPlaceholder("Drive name");
  await input.fill(driveName);

  const submit = page
    .getByText("Create new drive")
    .and(page.locator("button[type=submit]"));
  await submit.click();
  await page.getByText(driveName).waitFor({ state: "visible", timeout: 5000 });
}
