import type { Page } from "@playwright/test";
import { readRunRecord, signInLinksOf } from "@powerhousedao/host-core";
import { waitForAppReady } from "./wait.js";

/**
 * A fresh sign-in link of the running vetra stack (F3d): `ph run vetra`
 * keeps its secret in the owner-only run record.
 */
export function freshSignInLink(): string {
  const record = readRunRecord(process.cwd(), "vetra");
  const link = record ? signInLinksOf(record)[0]?.link : undefined;
  if (!link) {
    throw new Error("The running vetra stack's record keeps no sign-in link");
  }
  return link;
}

/**
 * Opens Connect by its sign-in link, so the tab writes as this computer's
 * identity: a page opened without it writes as no user, which a switchboard
 * refuses.
 */
export async function signInByLink(page: Page): Promise<void> {
  // A full load: Connect reads the link's code when it boots, and a page
  // already on its origin would only change its hash.
  if (page.url() !== "about:blank") await page.goto("about:blank");
  await page.goto(freshSignInLink());
  await waitForAppReady(page);
  await page.waitForFunction(
    () =>
      (
        window as unknown as {
          ph?: { renown?: { user?: { localIdentity?: string } } };
        }
      ).ph?.renown?.user?.localIdentity === "machine",
    undefined,
    { timeout: 60_000 },
  );
}
