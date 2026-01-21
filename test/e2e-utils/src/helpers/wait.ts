import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

export const TIMEOUTS = {
  DEFAULT: 5000,
  ASYNC_CONTENT: 10000, // For drives loaded via PH_CONNECT_DEFAULT_DRIVES_URL
  ANIMATION: 300,
  FORM_SUBMIT: 10000,
} as const;

export async function waitForVisible(
  locator: Locator,
  options?: { timeout?: number },
): Promise<void> {
  await expect(locator).toBeVisible({
    timeout: options?.timeout ?? TIMEOUTS.DEFAULT,
  });
}

export async function waitForAsyncContent(
  locator: Locator,
  options?: { timeout?: number },
): Promise<void> {
  await expect(locator).toBeVisible({
    timeout: options?.timeout ?? TIMEOUTS.ASYNC_CONTENT,
  });
}

export async function safeClick(
  locator: Locator,
  options?: { timeout?: number },
): Promise<void> {
  await expect(locator).toBeVisible({
    timeout: options?.timeout ?? TIMEOUTS.DEFAULT,
  });
  await locator.click();
}

export async function waitForNetworkIdle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

export async function waitForDialog(
  dialogLocator: Locator,
  options?: { timeout?: number },
): Promise<void> {
  await expect(dialogLocator).toBeVisible({
    timeout: options?.timeout ?? TIMEOUTS.DEFAULT,
  });
  await dialogLocator.page().waitForTimeout(TIMEOUTS.ANIMATION);
}
