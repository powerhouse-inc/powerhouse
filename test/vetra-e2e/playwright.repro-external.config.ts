import { defineConfig, devices } from "@playwright/test";

// Runs the upgrade repro spec against an ALREADY RUNNING `ph vetra --watch`
// in another project (e.g. a clean `ph init` scaffold). Pass the project via
// env: REPRO_PROJECT_DIR, REPRO_VETRA_DRIVE, REPRO_REACTOR_URL.
export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "line",
  use: {
    acceptDownloads: true,
    trace: "off",
    video: "off",
    screenshot: "only-on-failure",
    baseURL: "http://localhost:3001",
  },
  projects: [
    {
      name: "external-project",
      testMatch: /upgrade-repro\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
