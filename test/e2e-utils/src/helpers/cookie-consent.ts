import type { Page } from "@playwright/test";

/**
 * Helper function to handle cookie consent banner.
 * Uses Vetra's more robust implementation with getByRole and optional wait.
 *
 * @param page - Playwright Page object
 * @param options - Optional configuration
 * @param options.waitAfterAccept - Time to wait after accepting cookies in milliseconds (default: 1000)
 *
 * @example
 * ```typescript
 * // Use default 1000ms wait
 * await handleCookieConsent(page);
 *
 * // Custom wait time
 * await handleCookieConsent(page, { waitAfterAccept: 500 });
 *
 * // No wait
 * await handleCookieConsent(page, { waitAfterAccept: 0 });
 * ```
 */
export async function handleCookieConsent(
  page: Page,
  options?: {
    waitAfterAccept?: number;
  },
) {
  const waitAfterAccept = options?.waitAfterAccept ?? 1000;

  const cookieButton = page.getByRole("button", {
    name: "Accept configured cookies",
  });

  if (await cookieButton.isVisible()) {
    await cookieButton.click();

    // Wait for the UI to update after accepting cookies
    if (waitAfterAccept > 0) {
      await page.waitForTimeout(waitAfterAccept);
    }
  }
}
