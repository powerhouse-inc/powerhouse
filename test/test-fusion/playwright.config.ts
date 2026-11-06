import { defineConfig, devices } from "@playwright/test";

const PORT = 3110;
export const BASE_URL = `http://localhost:${PORT}`;

// A local Switchboard (`ph switchboard --dev` in ../versioned-documents) serves
// the Renown auth GraphQL. See that webServer entry below.
const SWITCHBOARD_PORT = 4001;
export const SWITCHBOARD_URL = `http://localhost:${SWITCHBOARD_PORT}/graphql`;

// A second dev server in redirect sign-in mode. Its Renown portal is a fake
// origin that e2e/renown-redirect.spec.ts intercepts and plays the part of.
const REDIRECT_PORT = 3111;
export const REDIRECT_BASE_URL = `http://localhost:${REDIRECT_PORT}`;
export const FAKE_RENOWN_URL = "http://renown.test";

// The dev server runs with the mock wallet adapter so sign-in is deterministic
// in CI — no real wallet extension or Google OAuth. See src/lib/renown.ts.
//
// The app bundles `@powerhousedao/reactor-browser` from its BUILT `dist/`, not
// from source, so these specs only exercise a source change once that package
// has been rebuilt. The `test:e2e` script builds it first; running
// `playwright test` directly skips that and can validate a stale bundle.
export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: /renown-redirect\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "redirect",
      testMatch: /renown-redirect\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: REDIRECT_BASE_URL },
    },
  ],
  webServer: [
    {
      // `--dev` loads versioned-documents' local models + the renown-package
      // (config `packages`), so the mock's signed credential verifies + stores.
      command: `pnpm exec ph-cli switchboard --dev --port ${SWITCHBOARD_PORT}`,
      cwd: "../versioned-documents",
      url: SWITCHBOARD_URL,
      stdout: "pipe",
      stderr: "pipe",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `pnpm exec next dev --port ${PORT}`,
      url: BASE_URL,
      env: {
        NEXT_PUBLIC_RENOWN_MOCK: "1",
        NEXT_PUBLIC_RENOWN_SWITCHBOARD_URL: SWITCHBOARD_URL,
        NEXT_PUBLIC_SWITCHBOARD_URL: SWITCHBOARD_URL,
      },
      stdout: "pipe",
      stderr: "pipe",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `pnpm exec next dev --port ${REDIRECT_PORT}`,
      url: REDIRECT_BASE_URL,
      env: {
        NEXT_DIST_DIR: ".next-redirect",
        NEXT_PUBLIC_RENOWN_LOGIN_MODE: "redirect",
        NEXT_PUBLIC_RENOWN_URL: FAKE_RENOWN_URL,
        NEXT_PUBLIC_RENOWN_SWITCHBOARD_URL: SWITCHBOARD_URL,
        NEXT_PUBLIC_SWITCHBOARD_URL: SWITCHBOARD_URL,
      },
      stdout: "pipe",
      stderr: "pipe",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
