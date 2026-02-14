import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { camelCase } from "change-case";

// Import shared types and functions from e2e-utils package
export {
  clickDocumentOperationHistory,
  closeDocumentFromToolbar,
  closeDocumentOperationHistory,
} from "@powerhousedao/e2e-utils/helpers/document";
export type { DocumentBasicData } from "@powerhousedao/e2e-utils/types";

// Import the type for local use
import type { DocumentBasicData } from "@powerhousedao/e2e-utils/types";

/**
 * Helper function to create a new document (Connect-specific implementation).
 * @param page - Playwright Page object
 * @param documentType - Type of document to create (e.g. "DocumentModel")
 * @param documentName - Name for the new document
 */
export async function createDocument(
  page: Page,
  documentType: string,
  documentName: string,
) {
  // Click the document type button
  await page
    .locator(".flex.w-full.flex-wrap.gap-4")
    .getByText(documentType)
    .click();

  const form = page.locator('form[name="create-document"]').last();

  // Fill in the document name
  await form.locator('input[type="text"]').fill(documentName);

  // Click create button
  await form.locator('button:has-text("Create")').click();

  // Wait for the document to be created and opened
  await page.getByText(documentName).first().waitFor({ state: "visible" });
}

/**
 * Helper function to check if a document type is available for creation (Connect-specific).
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
    .click();
}

/**
 * Helper function to create a document and fill its basic data (Connect-specific).
 * @param page - Playwright Page object
 * @param documentName - Name for the new document
 * @param data - Basic document data to fill
 */
export async function createDocumentAndFillBasicData(
  page: Page,
  documentName: string,
  data: DocumentBasicData,
) {
  // Create the document
  await createDocument(page, "DocumentModel", documentName);

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
    // Uncheck "Sync with schema" FIRST to prevent auto-sync race condition.
    // The StateEditor's useMemo/useEffect auto-sync computes a fixedState
    // with _placeholder when the schema changes and sync is enabled,
    // corrupting the initialValue string via concatenation in CodeMirror.
    const syncCheckbox = page.getByRole("checkbox", {
      name: "Sync with schema",
    });
    await syncCheckbox.uncheck();
    await expect(syncCheckbox).not.toBeChecked();

    // Focus the schema editor
    await page.click(".cm-editor");

    // Select all and delete
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");

    await page.locator(".cm-content").first().fill(data.global.schema);

    await page.getByText("Global State Schema").first().click();

    // Wait for the second CodeMirror editor to be ready
    const initialStateEditor = page.locator(".cm-content").nth(1);
    await expect(initialStateEditor).toBeVisible({ timeout: 5000 });

    // Clear the initial state editor before filling to avoid content
    // concatenation if auto-sync managed to populate it
    await initialStateEditor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.press("Backspace");
    await initialStateEditor.fill(data.global.initialState);

    await page.getByText("global state initial value").first().click();
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

        // Wait for the operation editor to be created and visible
        const operationInputName = camelCase(operation.name);
        const operationEditor = page
          .locator(".cm-content", {
            hasText: operationInputName,
          })
          .first();
        await expect(operationEditor).toBeVisible({ timeout: 5000 });

        await operationEditor.click();

        await page.keyboard.press("ControlOrMeta+A");
        await page.keyboard.press("Backspace");

        await page.keyboard.insertText(operation.schema);

        await page.keyboard.press("Enter");
        // Click away to blur and commit the changes
        const globalSchemaLabel = page.getByText("Global State Schema").first();
        await expect(globalSchemaLabel).toBeVisible({ timeout: 5000 });
        await globalSchemaLabel.click();
      }
    }
  }

  // Final blur to ensure all changes are committed
  const finalLabel = page.getByText("Global State Schema").first();
  await expect(finalLabel).toBeVisible({ timeout: 5000 });
  await finalLabel.click();
}
