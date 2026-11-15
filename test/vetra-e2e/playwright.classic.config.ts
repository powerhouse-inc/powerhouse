import { defineConfig, devices } from "@playwright/test";

export const CONNECT_URL = "http://localhost:3001";

// The classic commands smoke: one boot spec against `ph vetra --watch` started
// the classic way, not through the vetra host. It proves the classic commands
// still work in this release, and goes away with them.
export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "vetra-classic",
      testMatch: /hello-world\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: CONNECT_URL },
    },
  ],
  webServer: [
    {
      command: "pnpm exec ph-cli vetra --watch",
      url: CONNECT_URL,
      stderr: "pipe",
      stdout: "pipe",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
