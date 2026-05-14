import { defineConfig, devices } from "@playwright/test";

export const CONNECT_URL = process.env.CONNECT_URL ?? "http://localhost:3001";
export const SWITCHBOARD_URL =
  process.env.SWITCHBOARD_URL ?? "http://localhost:4001";

export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: CONNECT_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 30_000,
    // Pre-seed Connect's cookie banner localStorage so the banner doesn't
    // intercept clicks. Same trick vetra-e2e uses.
    storageState: {
      cookies: [],
      origins: [
        {
          origin: CONNECT_URL,
          localStorage: [
            { name: "/:display-cookie-banner", value: "false" },
            {
              name: "/:acceptedCookies",
              value:
                '{"analytics":true,"marketing":false,"functional":false}',
            },
          ],
        },
      ],
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
