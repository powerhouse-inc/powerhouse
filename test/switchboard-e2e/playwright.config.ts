import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Switchboard E2E Tests
 *
 * This configuration:
 * 1. Runs global-setup.ts first (generates processor, builds project)
 * 2. Starts the reactor via webServer
 * 3. Runs Playwright tests against the GraphQL endpoint
 */

export const REACTOR_URL = "http://localhost:4001";
export const GRAPHQL_URL = `${REACTOR_URL}/graphql`;

export default defineConfig({
  // Test directory
  testDir: "./tests",

  // Output directory for test artifacts
  outputDir: "test-results",

  // Global setup and teardown
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",

  // Run tests in files in parallel (but within file, tests are serial)
  fullyParallel: false,

  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Single worker for serial test execution
  workers: 1,

  // Reporter configuration
  reporter: [["html", { open: "never" }], ["list"]],

  // Shared settings for all tests
  use: {
    // Base URL for API requests
    baseURL: REACTOR_URL,

    // Collect trace when retrying the failed test
    trace: "on-first-retry",

    // Capture video on failure
    video: "retain-on-failure",

    // Capture screenshot on failure
    screenshot: "only-on-failure",

    // Longer timeout for GraphQL operations
    actionTimeout: 10000,
  },

  // Test timeout
  timeout: 30000,

  // Expect timeout
  expect: {
    timeout: 5000,
  },

  // Browser configuration
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start reactor before running tests
  // NOTE: You can also start the reactor manually with `ph reactor` in the workspace root
  //       and the tests will reuse that server (reuseExistingServer: true)
  webServer: {
    command: "pnpm reactor",
    url: GRAPHQL_URL,
    reuseExistingServer: true, // Always reuse if reactor is already running
    timeout: 120000, // 2 minutes to start
    stdout: "pipe",
    stderr: "pipe",
  },
});

