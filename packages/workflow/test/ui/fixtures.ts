import { test as base, type Page } from "@playwright/test";
import {
  addSeededDrive,
  detachDrive,
  isHealthy,
  openConnect,
  resetConnect,
  type ConnectPage,
  type SeededPage,
} from "../../scripts/ui-stack.js";

export const test = base.extend<
  {
    theme: "light" | "dark";
    // Off for specs that add their own documents and never read the seed.
    seed: boolean;
    stack: SeededPage;
    app: Page;
  },
  { connect: { current: ConnectPage } }
>({
  theme: ["light", { option: true }],
  seed: [true, { option: true }],
  // One light Connect per worker; a test that breaks it gets a fresh one.
  connect: [
    async ({ browser }, use) => {
      const connect = { current: await openConnect(browser) };
      await use(connect);
      await connect.current.context.close();
    },
    { scope: "worker", timeout: 90_000 },
  ],
  // A new drive per test, alone in Connect, so tests never share documents.
  // Another theme boots its own Connect. Its own budget, so a slow seed
  // doesn't spend the test's.
  stack: [
    async ({ browser, connect, theme, seed }, use) => {
      const own = theme !== "light";
      if (!own && !(await isHealthy(connect.current.page))) {
        await connect.current.context.close().catch(() => {});
        connect.current = await openConnect(browser);
      }
      const { context, page } = own
        ? await openConnect(browser, { colorScheme: theme })
        : connect.current;
      await resetConnect(page);
      const { drive, seeded } = await addSeededDrive(page, { seed });
      await use({ context, page, drive, seeded });
      if (own) await context.close();
      else await detachDrive(page, drive).catch(() => {});
    },
    { timeout: 90_000 },
  ],
  app: async ({ stack }, use) => {
    await use(stack.page);
  },
});

export { expect } from "@playwright/test";
