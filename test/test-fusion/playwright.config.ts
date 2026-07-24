import { defineConfig, devices } from "@playwright/test";

const PORT = 3110;
export const BASE_URL = `http://localhost:${PORT}`;

// A local Switchboard (`ph switchboard --dev` in ../versioned-documents) serves
// the Renown auth GraphQL. See that webServer entry below.
const SWITCHBOARD_PORT = 4001;
const SWITCHBOARD_URL = `http://localhost:${SWITCHBOARD_PORT}/graphql`;

// The dev server runs with the mock wallet adapter so sign-in is deterministic
// in CI — no real wallet extension or Google OAuth. See src/lib/renown.ts.
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
        NEXT_PUBLIC_SWITCHBOARD_URL: SWITCHBOARD_URL,
      },
      stdout: "pipe",
      stderr: "pipe",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
