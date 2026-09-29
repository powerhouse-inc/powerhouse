import { defineConfig } from "@playwright/test";

// UI tests against the live stack in scripts/ui-stack.ts; each test seeds its
// own drive, so they run in parallel against one switchboard and Connect.
export default defineConfig({
  testDir: "./test/ui",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  globalSetup: "./test/ui/global-setup.ts",
  use: {
    // A click that can't land fails fast instead of eating the test timeout.
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
