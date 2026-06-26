import type { Page } from "@playwright/test";
import { reactorWorkerModeRequested } from "./fixtures.js";

// networkidle never settles in worker mode (the SharedWorker polls sync continuously), so skip it and rely on element-level waits.
export async function waitForAppReady(page: Page): Promise<void> {
  if (reactorWorkerModeRequested()) {
    await page.waitForLoadState("domcontentloaded");
    return;
  }
  await page.waitForLoadState("networkidle");
}
