import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { createLocalDrive } from "./drive.js";

/**
 * Generic helper function to navigate to a drive.
 * Creates a local drive if it doesn't exist and navigates to it.
 *
 * @param page - Playwright Page object
 * @param driveName - Name of the drive to navigate to
 *
 * @example
 * ```typescript
 * await goToDrive(page, "My Drive");
 * ```
 */
export async function goToDrive(page: Page, driveName: string) {
  await createLocalDrive(page, driveName);

  // Click on the drive
  await page.click(`text=${driveName}`);
  await expect(page.getByText("Documents and files")).toBeVisible({
    timeout: 5000,
  });
}

/**
 * Backward compatibility alias for Connect E2E tests.
 * @see goToDrive
 */
export const goToConnectDrive = goToDrive;

/**
 * Backward compatibility alias for Vetra E2E tests.
 * @see goToDrive
 */
export const goToVetraDrive = goToDrive;

/**
 * Helper function to navigate into a folder and verify it's visible.
 *
 * @param page - Playwright Page object
 * @param folderName - Name of the folder to navigate into
 *
 * @example
 * ```typescript
 * await navigateIntoFolder(page, "My Folder");
 * ```
 */
export async function navigateIntoFolder(page: Page, folderName: string) {
  await page.click(`text=${folderName}`);
  await page.getByText(folderName).waitFor({ state: "visible", timeout: 5000 });
}

/**
 * Helper function to navigate back through breadcrumbs and verify folder visibility.
 *
 * @param page - Playwright Page object
 * @param currentFolder - Current folder name that should disappear
 * @param targetFolder - Target folder name that should have exactly one instance visible
 *
 * @example
 * ```typescript
 * await navigateBackAndVerify(page, "Subfolder", "Parent Folder");
 * ```
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

/**
 * Helper function to verify a document is visible in the document list.
 *
 * @param page - Playwright Page object
 * @param documentName - Name of the document to verify
 * @param documentType - Type of the document to verify
 *
 * @example
 * ```typescript
 * await verifyDocumentInList(page, "My Document", "Document Model");
 * ```
 */
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

/**
 * Helper function to open a document by clicking its name in the list.
 *
 * @param page - Playwright Page object
 * @param documentName - Name of the document to open
 *
 * @example
 * ```typescript
 * await openDocumentByName(page, "My Document");
 * ```
 */
export async function openDocumentByName(page: Page, documentName: string) {
  const docLocator = page
    .locator("div.rounded-md.border-2.border-transparent.p-2")
    .getByText(documentName);
  await expect(docLocator).toBeVisible({ timeout: 5000 });
  await docLocator.click();
}
