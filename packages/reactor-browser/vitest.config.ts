import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defaultExclude, defineConfig } from "vitest/config";

// Tests in both projects stand up a whole reactor -- PGLite WASM cold boot plus
// migrations, and in the renown suite a P-256 keypair generation on top -- which
// runs in about a second locally and several times that on a shared CI runner.
// The default 5s is a budget for a unit test, not for that, so it is raised here
// the same way and for the same reason as in packages/reactor, reactor-api and
// pglite-fs. A genuinely hung test still fails, just later.
const REACTOR_BOOT_TIMEOUT_MS = 30_000;

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [react()],
        test: {
          name: "browser",
          include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
          exclude: [
            ...defaultExclude,
            "test/__screenshots__/**",
            "test/**/*.node.test.ts",
          ],
          globals: true,
          environment: "happy-dom",
          browser: {
            provider: playwright(),
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
          },
          testTimeout: REACTOR_BOOT_TIMEOUT_MS,
          hookTimeout: REACTOR_BOOT_TIMEOUT_MS,
        },
        optimizeDeps: {
          exclude: ["@electric-sql/pglite"],
        },
        define: {
          "process.env": {},
        },
      },
      {
        test: {
          name: "node",
          include: ["test/**/*.node.test.ts"],
          globals: true,
          environment: "node",
          testTimeout: REACTOR_BOOT_TIMEOUT_MS,
          hookTimeout: REACTOR_BOOT_TIMEOUT_MS,
        },
      },
    ],
  },
});
