import { type Page } from "@playwright/test";

export interface DocumentBasicData {
  documentType: string;
  authorName: string;
  description: string;
  authorWebsite: string;
  extension: string;
  schema?: string;
  modules?: {
    name: string;
    operations: {
      name: string;
      schema: string;
      description?: string;
      exceptions?: string[];
    }[];
  }[];
}

/**
 * Helper function to create a new document
 * @param page Playwright Page object
 * @param documentType Type of document to create (e.g. "DocumentModel")
 * @param documentName Name for the new document
 */
export async function createDocument(
  page: Page,
  documentType: string,
  documentName: string,
) {
  // Click the document type button
  await page.click(`text=${documentType}`);

  // Fill in the document name
  await page.fill('input[type="text"]', documentName);

  // Click create button
  await page.click('button:has-text("Create")');

  // Wait for the document to be created and opened
  await page.getByText(documentName).first().waitFor({ state: "visible" });
}

/**
 * Helper function to close document from toolbar
 * @param page Playwright Page object
 */
export async function closeDocumentFromToolbar(page: Page) {
  // Click the close button in the document toolbar (using the SVG path)
  await page.click('button:has(svg path[d^="M3.32875"])');
}

/**
 * Helper function to create a document and fill its basic data
 * @param page Playwright Page object
 * @param documentName Name for the new document
 * @param data Basic document data to fill
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

  if (data.schema) {
    // Focus the editor
    await page.click(".cm-editor");

    // Select all and delete
    await page.keyboard.press("Meta+A"); // Use 'Control+A' on Windows if needed
    await page.keyboard.press("Backspace");

    await page.locator(".cm-content").first().fill(data.schema);
    await page.getByText("Global State Schema").first().click();
    await page.waitForTimeout(200);
    await page.getByText("Sync with schema").click();
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

        await page
          .locator(".mt-4.grid.grid-cols-2.gap-x-12")
          .last()
          .locator(".cm-editor")
          .click();

        await page.keyboard.press("Meta+A"); // Use 'Control+A' on Windows if needed
        await page.keyboard.press("Backspace");

        await page
          .locator(".mt-4.grid.grid-cols-2.gap-x-12")
          .last()
          .locator(".cm-content")
          .first()
          .fill(operation.schema);

        await page.keyboard.press("Enter");
        await page.getByText("Global State Schema").first().click();
        await page.waitForTimeout(500);
      }
    }
  }

  await page.getByText("Global State Schema").first().click();
  await page.waitForTimeout(1000);
}

export async function clickDocumentOperationHistory(page: Page) {
  await page
    .locator(
      ".flex.h-12.w-full.items-center.justify-between.rounded-xl.border.border-gray-200.bg-slate-50.px-4",
    )
    .locator("div")
    .last()
    .locator("button") // or whatever element type
    .nth(1)
    .click();
}

export async function closeDocumentOperationHistory(page: Page) {
  await page
    .locator(".shadow-button.rounded-lg.bg-gray-50.p-1.text-slate-100")
    .first()
    .click();
}
