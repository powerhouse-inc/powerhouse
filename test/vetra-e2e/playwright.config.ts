import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

export const CONNECT_URL = "http://localhost:3001";
export const REACTOR_URL = "http://localhost:4002";
export const PREVIEW_URL = "http://localhost:4173";
// test/versioned-documents: a Connect with its own routes, styles and composition.
export const CUSTOM_CONNECT_URL = "http://localhost:3002";

// Worker runs only need the dev server, so they skip the slow connect-preview build.
const workerMode =
  process.env.PH_REACTOR_WORKER === "1" ||
  process.env.PH_REACTOR_WORKER === "true";

const previewProject = {
  name: "connect-preview",
  testMatch: /(runtime-config-preview|devtools-production)\.spec\.ts/,
  use: { ...devices["Desktop Chrome"], baseURL: PREVIEW_URL },
  dependencies: ["vetra-dev"],
};

const previewWebServer = {
  // The connect-preview host builds into `dist-connect` so the Connect SPA
  // build does NOT collide with `pnpm build` (= `ph-cli build`, the
  // *package* build) that todo-document.spec.ts runs into the default
  // `dist/`. Both commands write to `dist/` otherwise and the package build
  // trashes the SPA.
  command:
    (process.env.PH_COVERAGE_BROWSER_DIR ? "env -u NODE_V8_COVERAGE " : "") +
    "pnpm exec ph-cli run connect-preview build && pnpm exec ph-cli run connect-preview serve --port 4173 --strictPort",
  url: PREVIEW_URL,
  stderr: "pipe" as const,
  stdout: "pipe" as const,
  reuseExistingServer: !process.env.CI,
  ...(process.env.PH_COVERAGE_BROWSER_DIR
    ? { gracefulShutdown: { signal: "SIGTERM" as const, timeout: 10000 } }
    : {}),
  timeout: 5 * 60 * 1000,
};

const customConnectProject = {
  name: "custom-connect",
  testMatch: /devtools-custom-connect\.spec\.ts/,
  use: { ...devices["Desktop Chrome"], baseURL: CUSTOM_CONNECT_URL },
};

const customConnectWebServer = {
  command: "pnpm exec ph-cli run connect dev",
  cwd: fileURLToPath(new URL("../versioned-documents", import.meta.url)),
  url: CUSTOM_CONNECT_URL,
  stderr: "pipe" as const,
  stdout: "pipe" as const,
  reuseExistingServer: !process.env.CI,
  timeout: 5 * 60 * 1000,
};

// The DevTools Build spec writes a document model, an editor and a drive app
// into this project with `ph-cli generate`, and removes them when it ends.
// While they exist the vetra host serves them: Connect reloads its tabs and
// loads the editor and the drive app, and the switchboard registers the
// model. A run killed before the spec's cleanup leaves them behind. So it
// runs after the others, where neither can reach another spec.
const devtoolsBuildProject = {
  name: "devtools-build",
  testMatch: /devtools-build\.spec\.ts/,
  use: { ...devices["Desktop Chrome"], baseURL: CONNECT_URL },
  dependencies: workerMode ? ["vetra-dev"] : ["vetra-dev", "connect-preview"],
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

  /* Projects:
   *  - vetra-dev runs the existing specs against `ph run vetra` (the vetra
   *    host, dev mode).
   *  - connect-preview runs the runtime-config preview specs against
   *    `ph connect build && ph connect preview` (production-built dist served
   *    as static files). `dependencies: ["vetra-dev"]` forces strict ordering:
   *    all vetra-dev tests finish before connect-preview tests start so the
   *    two test sets cannot interfere on shared files (dist/ is only touched
   *    by connect-preview tests).
   *  - custom-connect runs the DevTools spec against test/versioned-documents'
   *    own Connect (`ph run connect dev`, port 3002).
   *  - devtools-build runs the DevTools Build spec against the vetra host,
   *    after vetra-dev and connect-preview: it changes the project's code
   *    while it runs.
   */
  projects: [
    {
      name: "vetra-dev",
      // upgrade-repro is a diagnostic harness with its own configs
      // (playwright.repro.config.ts / playwright.repro-external.config.ts);
      // its setup expects a project-specific vetra drive that does not exist
      // under this suite's fixture, so it can never pass here.
      testIgnore:
        /runtime-config-preview\.spec\.ts|upgrade-repro\.spec\.ts|devtools-(custom-connect|production|build)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: CONNECT_URL },
    },
    ...(workerMode ? [] : [previewProject, customConnectProject]),
    devtoolsBuildProject,
  ],

  /* One webServer per project. Both come up at playwright init; tests in each
   * project hit their own baseURL so they never cross paths.
   */
  webServer: [
    {
      // No --watch: the vetra host's dev verb always loads the project's
      // models and editors and serves the preview drive.
      command: "pnpm vetra",
      url: CONNECT_URL,
      stderr: "pipe",
      stdout: "pipe",
      reuseExistingServer: !process.env.CI,
      ...(process.env.PH_COVERAGE_BROWSER_DIR
        ? { gracefulShutdown: { signal: "SIGTERM" as const, timeout: 10000 } }
        : {}),
    },
    ...(workerMode ? [] : [previewWebServer, customConnectWebServer]),
  ],
});
