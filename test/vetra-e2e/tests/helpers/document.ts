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

  // Wait for the create document dialog to be visible
  // Look for the dialog that contains "Create a new document" text
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 5000 });

  // Fill in the document name - find the input within the dialog
  const nameInput = dialog.getByPlaceholder("Document name");
  await expect(nameInput).toBeVisible({ timeout: 5000 });
  await nameInput.fill(documentName);

  // Wait for Create button to be enabled (validation passes)
  const createButton = dialog.getByRole("button", { name: "Create" });
  await expect(createButton).toBeEnabled({ timeout: 5000 });
  await createButton.click();

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
      await cookieButton.waitFor({ state: "hidden", timeout: 5000 });
    }
  }

  // Wait for the app skeleton to finish loading
  await page
    .locator(".skeleton-loader")
    .waitFor({ state: "hidden", timeout: 30000 });

  // Wait for Vetra drive card to appear (default drives load asynchronously)
  // Look for the h3 heading with "Vetra" which is the drive title
  const vetraDrive = page.getByRole("heading", { name: "Vetra", level: 3 });
  await expect(vetraDrive).toBeVisible({ timeout: 15000 });
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
    // Focus the first CodeMirror editor (global state schema)
    const schemaEditor = page.locator(".cm-content").first();
    await expect(schemaEditor).toBeVisible({ timeout: 5000 });
    await schemaEditor.click();

    // Select all and delete existing content
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    // Use insertText instead of fill() for CodeMirror (contenteditable div)
    await page.keyboard.insertText(data.global.schema);

    // Click away to blur and commit changes
    await page.getByText("global state schema").first().click();

    // Uncheck "Sync with schema" to prevent auto-updates overwriting our value
    const syncCheckbox = page.getByRole("checkbox", {
      name: "Sync with schema",
    });
    if (await syncCheckbox.isChecked()) {
      await syncCheckbox.click();
    }

    // Wait for the second CodeMirror editor to be ready (initial state value)
    const initialStateEditor = page.locator(".cm-content").nth(1);
    await expect(initialStateEditor).toBeVisible({ timeout: 5000 });
    await initialStateEditor.click();

    // Select all and delete existing content
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    // Use insertText instead of fill() for CodeMirror
    await page.keyboard.insertText(data.global.initialState);

    // Click away to blur and commit changes
    await page.getByText("global state initial value").first().click();
  }

  if (data.modules) {
    for (const module of data.modules) {
      // Wait for module textarea to be ready
      const moduleInput = page
        .locator('textarea[placeholder="Add module"]')
        .last();
      await expect(moduleInput).toBeVisible({ timeout: 5000 });
      await moduleInput.fill(module.name);
      await page.keyboard.press("Enter");

      for (let i = 0; i < module.operations.length; i++) {
        const operation = module.operations[i];

        // Wait for operation textarea to be ready
        const operationInput = page
          .locator('textarea[placeholder="Add operation"]')
          .last();
        await expect(operationInput).toBeVisible({ timeout: 5000 });
        await operationInput.fill(operation.name);
        await page.keyboard.press("Enter");

        // Wait for the new operation to be created by checking the operation name appears
        // The operation name gets converted to SCREAMING_SNAKE_CASE in the UI
        const expectedName = operation.name.toUpperCase().replace(/\s+/g, "_");
        const operationNameField = page.locator(
          `textarea[placeholder="Add operation"]:has-text("${expectedName}")`,
        );
        await expect(operationNameField).toBeVisible({ timeout: 5000 });

        // Count total CodeMirror editors: 2 (schema + initial state) + number of operations created so far
        // The operation editors start after the first 2 global editors
        const operationEditorIndex = 2 + i;
        const operationEditor = page
          .locator(".cm-content")
          .nth(operationEditorIndex);
        await expect(operationEditor).toBeVisible({ timeout: 5000 });

        await operationEditor.click();

        // Select all and delete existing content
        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");

        // Insert the operation schema
        await page.keyboard.insertText(operation.schema);

        // Click away to blur and commit the changes
        const globalSchemaLabel = page.getByText("Global State Schema").first();
        await expect(globalSchemaLabel).toBeVisible({ timeout: 5000 });
        await globalSchemaLabel.click();
      }
    }
  }
}
