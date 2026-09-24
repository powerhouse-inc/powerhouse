import { test as base, type Page } from "@playwright/test";
import { openSeededPage } from "../../scripts/ui-stack.js";

export const test = base.extend<{ theme: "light" | "dark"; app: Page }>({
  theme: ["light", { option: true }],
  // A fresh context on a new drive per test, so tests never share state.
  app: async ({ browser, theme }, use) => {
    const { context, page } = await openSeededPage(browser, {
      colorScheme: theme,
    });
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
