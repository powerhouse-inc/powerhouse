import { defineConfig, devices } from "@playwright/test";

export const CONNECT_URL = "http://localhost:3001";

// Trimmed config for the upgrade-repro investigation: only the vetra dev
// server and the vetra-dev project, no connect-preview build.
export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    acceptDownloads: true,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "vetra-dev",
      testMatch: /upgrade-repro\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: CONNECT_URL },
    },
  ],
  webServer: [
    {
      command: "pnpm vetra --watch",
      url: CONNECT_URL,
      stderr: "pipe",
      stdout: "pipe",
      reuseExistingServer: true,
    },
  ],
});
