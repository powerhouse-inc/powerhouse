import { defineConfig, devices } from "@playwright/test";

export const CONNECT_URL = "http://127.0.0.1:3000";
export const REACTOR_URL = "http://127.0.0.1:4001";

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// import path from 'path';
// dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests",
  /* Global setup and teardown for codegen */
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    // baseURL: 'http://127.0.0.1:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    acceptDownloads: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },

    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },

    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer configuration removed - services are started manually in CI
  // webServer: [
  //   {
  //     command: "pnpm connect",
  //     url: CONNECT_URL,
  //     stderr: "pipe",
  //     stdout: "pipe",
  //     reuseExistingServer: !process.env.CI,
  //   },
  //   {
  //     command: "pnpm reactor",
  //     url: `${REACTOR_URL}/graphql`,
  //     stderr: "pipe",
  //     stdout: "pipe",
  //     reuseExistingServer: !process.env.CI,
  //   },
  // ],
});
