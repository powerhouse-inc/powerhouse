import { defineConfig } from "@playwright/test";
import { availableParallelism } from "node:os";

// UI tests against the live stack in scripts/ui-stack.ts; each test seeds its
// own drive, so they run in parallel against one switchboard and Connect.
export default defineConfig({
  testDir: "./test/ui",
  // Tests spread across workers one by one; each gets its own drive.
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  // A core for the stack, the rest for workers: 3 on CI's 4 vCPUs.
  workers: Math.min(8, Math.max(2, availableParallelism() - 1)),
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
    // The Connect build's service worker precaches the whole app.
    serviceWorkers: "block",
  },
});
