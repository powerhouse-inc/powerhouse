import { defineConfig, devices } from "@playwright/test";

export const REACTOR_URL = "http://localhost:4001";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  use: {
    baseURL: REACTOR_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm reactor",
      url: `${REACTOR_URL}/graphql`,
      stderr: "pipe",
      stdout: "pipe",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});

