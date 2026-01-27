import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Helper function to close document from toolbar.
 * Clicks the close button identified by its SVG path.
 * Waits for the button to be visible before clicking.
 *
 * @param page - Playwright Page object
 *
 * @example
 * ```typescript
 * await closeDocumentFromToolbar(page);
 * ```
 */
export async function closeDocumentFromToolbar(page: Page) {
  // Use id selector for more reliable selection, fall back to aria-label
  const closeButton = page.locator("#close-document-button");
  // Increase timeout to 15s to handle slow CI environments
  await expect(closeButton).toBeVisible({ timeout: 15000 });
  await closeButton.click();
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
