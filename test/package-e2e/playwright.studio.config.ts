import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { PROJECT_DIR } from "./scripts/lib/project.js";

// `ph connect studio` in the project publish-package.ts scaffolded: its
// @powerhousedao packages come from the registry's tarballs, not workspace
// links, so Vite serves Connect from node_modules as it does for every
// installed project. Point PH_PROJECT_PARENT/PH_PKG_NAME at another installed
// project to run the spec on its own.
export const STUDIO_PORT = Number(process.env.STUDIO_PORT ?? 3311);
export const STUDIO_URL = `http://localhost:${STUDIO_PORT}`;

export default defineConfig({
  testDir: "./tests",
  testMatch: "studio-boot.spec.ts",
  outputDir: "test-results/studio",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: STUDIO_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `${path.join(PROJECT_DIR, "node_modules/.bin/ph-cli")} connect studio --port ${STUDIO_PORT} --strictPort`,
    cwd: PROJECT_DIR,
    url: STUDIO_URL,
    // A cold start pre-bundles Connect's dependencies first.
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
