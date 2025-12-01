import type { Page } from "@playwright/test";

/**
 * Helper function to close document from toolbar.
 * Clicks the close button identified by its SVG path.
 *
 * @param page - Playwright Page object
 *
 * @example
 * ```typescript
 * await closeDocumentFromToolbar(page);
 * ```
 */
export async function closeDocumentFromToolbar(page: Page) {
  await page.getByLabel("Close document").click();
}

/**
 * Helper function to open the document operation history panel.
 *
 * @param page - Playwright Page object
 *
 * @example
 * ```typescript
 * await clickDocumentOperationHistory(page);
 * ```
 */
export async function clickDocumentOperationHistory(page: Page) {
  await page
    .locator("#document-editor-context > *:first-child > *:first-child")
    .locator("div")
    .last()
    .locator("button")
    .nth(0)
    .click();
}

/**
 * Helper function to close the document operation history panel.
 *
 * @param page - Playwright Page object
 *
 * @example
 * ```typescript
 * await closeDocumentOperationHistory(page);
 * ```
 */
export async function closeDocumentOperationHistory(page: Page) {
  await page.locator("button[name='close-revision-history']").first().click();
}
