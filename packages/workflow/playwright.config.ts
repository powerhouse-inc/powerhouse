import { defineConfig } from "@playwright/test";

// UI tests against the live stack in scripts/ui-stack.ts; each test seeds its
// own drive, so they run in parallel against one switchboard and Connect.
export default defineConfig({
  testDir: "./test/ui",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: [["list"]],
  globalSetup: "./test/ui/global-setup.ts",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
