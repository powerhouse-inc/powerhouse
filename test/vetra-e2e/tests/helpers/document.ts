import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

// Import shared types and functions from e2e-utils package
export type { DocumentBasicData } from "@powerhousedao/e2e-utils/types";
export {
  closeDocumentFromToolbar,
  clickDocumentOperationHistory,
  closeDocumentOperationHistory,
} from "@powerhousedao/e2e-utils/helpers/document";

// Import the type for local use
import type { DocumentBasicData } from "@powerhousedao/e2e-utils/types";

/**
 * Helper function to create a new document in Vetra drive (Vetra-specific).
 * @param page - Playwright Page object
 * @param documentType - Type of document to create (e.g., "powerhouse/document-model")
 * @param documentName - Name for the new document
 * @returns The created document's URL
 */
export async function createDocument(
  page: Page,
  documentType: string,
  documentName: string,
): Promise<string> {
  // Click the "Add new specification" button for the document type
  const addButton = page.getByRole("button", {
    name: `Add new specification ${documentType}`,
  });
  await expect(addButton).toBeVisible();
  await addButton.click();

  // Wait for dialog to open - using a timeout for the animation
  await page.waitForTimeout(500);

  // Find the form (use .last() in case there are duplicate forms)
  const form = page.locator('form[name="create-document"]').last();

  // Fill in the document name within the form
  await form.locator('input[type="text"]').fill(documentName);

  // Click create button within the form
  await form.locator('button:has-text("Create")').click();

  // Wait for navigation to the new document
  await page.waitForLoadState("networkidle");

  // Return the current URL
  return page.url();
}

/**
 * Helper function to check if a document type is available for creation (Vetra-specific).
 * @param page - Playwright Page object
 * @param documentType - Type of document to check
 */
export async function isDocumentAvailableForCreation(
  page: Page,
  documentType: string,
) {
  return await page
    .locator(".flex.w-full.flex-wrap.gap-4")
    .getByText(documentType)
    .isVisible();
}

/**
 * Navigate to Vetra drive from home page (Vetra-specific).
 * @param page - Playwright Page object
 * @param handleCookies - Whether to handle cookie consent (default: false)
 */
export async function navigateToVetraDrive(
  page: Page,
  handleCookies = false,
): Promise<void> {
  // Go to home page
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Handle cookie consent if requested
  if (handleCookies) {
    const cookieButton = page.getByRole("button", {
      name: "Accept configured cookies",
    });
    if (await cookieButton.isVisible()) {
      await cookieButton.click();
      await page.waitForTimeout(1000);
    }
  }

  // Click on Vetra drive
  const vetraDrive = page.getByText("Vetra Drive App");
  await vetraDrive.click();

  // Wait for drive page to load
  await page.waitForLoadState("networkidle");

  // Verify we're on the drive page
  const driveHeading = page.getByRole("heading", {
    name: "Vetra Studio Drive",
    level: 1,
  });
  await expect(driveHeading).toBeVisible();
}

/**
 * Navigate back to drive using the back button in the UI (Vetra-specific).
 * @param page - Playwright Page object
 */
export async function navigateBackToDrive(page: Page): Promise<void> {
  // Click the back/home button in the header
  // Looking for a button with an arrow/back icon
  const backButton = page.locator('button[type="button"]').first();
  await backButton.click();

  // Wait for navigation
  await page.waitForLoadState("networkidle");

  // Verify we're back on the drive page
  const driveHeading = page.getByRole("heading", {
    name: "Vetra Studio Drive",
    level: 1,
  });
  await expect(driveHeading).toBeVisible();
}

/**
 * Helper function to create a document and fill its basic data (Vetra-specific).
 * @param page - Playwright Page object
 * @param documentName - Name for the new document
 * @param data - Basic document data to fill
 */
export async function createDocumentAndFillBasicData(
  page: Page,
  documentName: string,
  data: DocumentBasicData,
) {
  // Create the document (powerhouse/document-model in Vetra)
  await createDocument(page, "powerhouse/document-model", documentName);

  // Fill in the basic data
  await page.getByPlaceholder("Document Type").fill(data.documentType);
  await page.getByText("Global State Schema").first().click();

  await page.locator('textarea[name="authorName"]').fill(data.authorName);
  await page.getByText("Global State Schema").first().click();

  await page.locator('textarea[name="description"]').fill(data.description);
  await page.getByText("Global State Schema").first().click();

  await page.locator('textarea[name="authorWebsite"]').fill(data.authorWebsite);
  await page.getByText("Global State Schema").first().click();

  await page.locator('textarea[name="extension"]').fill(data.extension);
  await page.getByText("Global State Schema").first().click();

  if (data.global) {
    // Focus the editor
    await page.click(".cm-editor");

    // Select all and delete
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    await page.locator(".cm-content").first().fill(data.global.schema);

    await page.getByText("Global State Schema").first().click();

    await page.waitForTimeout(500);

    await page.locator(".cm-content").nth(1).fill(data.global.initialState);

    await page.getByText("global state initial value").first().click();
    await page.waitForTimeout(500);
  }

  if (data.modules) {
    for (const module of data.modules) {
      await page
        .locator('textarea[placeholder="Add module"]')
        .last()
        .fill(module.name);
      await page.keyboard.press("Enter");

      for (const operation of module.operations) {
        await page
          .locator('textarea[placeholder="Add operation"]')
          .last()
          .fill(operation.name);
        await page.keyboard.press("Enter");

        // Wait for the operation to be created
        await page.waitForTimeout(1000);

        // In Vetra, operation schemas use CodeMirror editors
        // Find the editor that contains the operation name
        // Note: We need to find the last .cm-content as new operations are added at the end
        const operationEditor = page.locator(".cm-content").last();

        await operationEditor.click();

        // Select all and delete existing content
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");

        // Insert the operation schema
        await page.keyboard.insertText(operation.schema);

        await page.keyboard.press("Enter");
        await page.getByText("Global State Schema").first().click();
        await page.waitForTimeout(500);
      }
    }
  }
}
