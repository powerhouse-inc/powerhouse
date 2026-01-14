import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration for Switchboard
 * 
 * This configuration runs basic reactor tests without requiring
 * generated document models, processors, or subgraphs.
 */

export default defineConfig({
  testDir: "./tests",
  
  // Run tests in serial mode to maintain state between tests
  fullyParallel: false,
  
  // Fail the build on CI if you accidentally left test.only in the source code
  forbidOnly: !!process.env.CI,
  
  // Retry on CI only
  retries: process.env.CI ? 2 : 0,
  
  // Reporter
  reporter: "html",
  
  // Shared settings for all projects
  use: {
    // Base URL for tests
    baseURL: "http://localhost:4001",
    
    // Collect trace on failure
    trace: "on-first-retry",
    
    // Screenshot on failure
    screenshot: "only-on-failure",
  },

  // Configure projects for different browsers
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Start the reactor before running tests
  // NOTE: Currently disabled due to ph-cli module resolution issues
  // You need to start the reactor manually in a separate terminal:
  //   cd powerhouse && pnpm reactor
  // 
  // webServer: {
  //   command: "../../clis/ph-cli/dist/src/cli.js reactor",
  //   url: "http://localhost:4001/graphql",
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 120 * 1000, // 2 minutes for reactor to start
  //   stdout: "pipe",
  //   stderr: "pipe",
  // },
});
