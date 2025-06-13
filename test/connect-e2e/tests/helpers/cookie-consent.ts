import { type Page } from "@playwright/test";

/**
 * Helper function to handle cookie consent banner
 * @param page Playwright Page object
 */
export async function handleCookieConsent(page: Page) {
  const cookieButton = page.getByText("Accept configured cookies");
  if (await cookieButton.isVisible()) {
    await cookieButton.click();
  }
}
