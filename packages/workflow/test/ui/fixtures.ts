import { test as base, type Page } from "@playwright/test";
import { openSeededPage, type SeededPage } from "../../scripts/ui-stack.js";

export const test = base.extend<{
  theme: "light" | "dark";
  stack: SeededPage;
  app: Page;
}>({
  theme: ["light", { option: true }],
  // A fresh context on a new drive per test, so tests never share state.
  stack: async ({ browser, theme }, use) => {
    const stack = await openSeededPage(browser, { colorScheme: theme });
    await use(stack);
    await stack.context.close();
  },
  app: async ({ stack }, use) => {
    await use(stack.page);
  },
});

export { expect } from "@playwright/test";
