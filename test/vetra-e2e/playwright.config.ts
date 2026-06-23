import { defineConfig, devices } from "@playwright/test";

export const CONNECT_URL = "http://localhost:3001";
export const REACTOR_URL = "http://localhost:4002";
export const PREVIEW_URL = "http://localhost:4173";

// Worker runs only need the dev server, so they skip the slow connect-preview build.
const workerMode =
  process.env.PH_REACTOR_WORKER === "1" ||
  process.env.PH_REACTOR_WORKER === "true";

const previewProject = {
  name: "connect-preview",
  testMatch: /runtime-config-preview\.spec\.ts/,
  use: { ...devices["Desktop Chrome"], baseURL: PREVIEW_URL },
  dependencies: ["vetra-dev"],
};

const previewWebServer = {
  // Isolated `--outDir dist-connect` so the Connect SPA build does NOT
  // collide with `pnpm build` (= `ph-cli build`, the *package* build) that
  // todo-document.spec.ts runs into the default `dist/`. Both commands
  // write to `dist/` otherwise and the package build trashes the SPA.
  command:
    "pnpm exec ph-cli connect build --outDir dist-connect && pnpm exec ph-cli connect preview --outDir dist-connect --port 4173 --strictPort",
  url: PREVIEW_URL,
  stderr: "pipe" as const,
  stdout: "pipe" as const,
  reuseExistingServer: !process.env.CI,
  timeout: 5 * 60 * 1000,
};

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
  outputDir: "test-results",
  /* Global setup and teardown for codegen */
  globalSetup: "./global-setup.ts",
  globalTeardown: "./global-teardown.ts",
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Run tests sequentially since they share the same backend and drive */
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: "html",
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    acceptDownloads: true,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: "on-first-retry",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  /* Two projects:
   *  - vetra-dev runs the existing specs against `ph vetra --watch` (dev mode).
   *  - connect-preview runs the runtime-config preview specs against
   *    `ph connect build && ph connect preview` (production-built dist served
   *    as static files). `dependencies: ["vetra-dev"]` forces strict ordering:
   *    all vetra-dev tests finish before connect-preview tests start so the
   *    two test sets cannot interfere on shared files (dist/ is only touched
   *    by connect-preview tests).
   */
  projects: [
    {
      name: "vetra-dev",
      testIgnore: /runtime-config-preview\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: CONNECT_URL },
    },
    ...(workerMode ? [] : [previewProject]),
  ],

  /* One webServer per project. Both come up at playwright init; tests in each
   * project hit their own baseURL so they never cross paths.
   */
  webServer: [
    {
      command: "pnpm vetra --watch",
      url: CONNECT_URL,
      stderr: "pipe",
      stdout: "pipe",
      reuseExistingServer: !process.env.CI,
    },
    ...(workerMode ? [] : [previewWebServer]),
  ],
});
