import { expect, type Page } from "@playwright/test";
import { CONNECT_URL } from "../../playwright.config.js";
import { handleCookieConsent } from "./cookie-consent.js";

/**
 * Helper function to navigate to a specific drive in Connect
 * @param page Playwright Page object
 * @param driveName Name of the drive to navigate to
 */
export async function goToConnectDrive(page: Page, driveName: string) {
  // Navigate to URL
  await page.goto(CONNECT_URL);

  // Handle cookie consent
  await handleCookieConsent(page);

  // Click on the drive
  await page.click(`text=${driveName}`);
}

/**
 * Helper function to navigate into a folder and verify it's visible
 * @param page Playwright Page object
 * @param folderName Name of the folder to navigate into
 */
export async function navigateIntoFolder(page: Page, folderName: string) {
  await page.click(`text=${folderName}`);
  await page.getByText(folderName).waitFor({ state: "visible", timeout: 5000 });
}

/**
 * Helper function to navigate back through breadcrumbs and verify folder visibility
 * @param page Playwright Page object
 * @param currentFolder Current folder name that should disappear
 * @param targetFolder Target folder name that should have exactly one instance visible
 */
export async function navigateBackAndVerify(
  page: Page,
  currentFolder: string,
  targetFolder: string,
) {
  await page.click(`text=${targetFolder}`);
  await expect(page.getByText(currentFolder)).toHaveCount(1);
  await expect(page.getByText(targetFolder)).toHaveCount(1);
}

export async function verifyDocumentInList(
  page: Page,
  documentName: string,
  documentType: string,
): Promise<void> {
  await expect(
    page
      .locator("div.rounded-md.border-2.border-transparent.p-2")
      .getByText(documentName),
  ).toBeVisible();
  await expect(
    page
      .locator("div.rounded-md.border-2.border-transparent.p-2")
      .getByText(documentType),
  ).toBeVisible();
}

export async function openDocumentByName(page: Page, documentName: string) {
  await page
    .locator("div.rounded-md.border-2.border-transparent.p-2")
    .getByText(documentName)
    .click({ force: true });
}
