import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import tsconfigPaths from "vite-tsconfig-paths";
import { defaultExclude, defineConfig } from "vitest/config";

// Provisioning a reactor stands up a whole PGlite (WASM cold boot plus the
// reactor migrations), which takes seconds rather than milliseconds — same as
// packages/reactor-monitor's own suite.
const REACTOR_BOOT_TIMEOUT_MS = 60_000;

// Use the "source" export condition from package.json exports maps, matching
// apps/connect/vitest.config.ts and the project-wide tsconfig.options.json
// `"customConditions": ["source"]` convention, so vitest resolves
// @powerhousedao/reactor-monitor (and @powerhousedao/reactor,
// @powerhousedao/reactor-browser) via their TypeScript source rather than
// requiring `dist/` to exist first. This has to be set on `ssr.resolve` as
// well as `resolve`: vitest's node pool resolves through the SSR
// environment, and `resolve.conditions` alone leaves it on "import" -> a
// stale `dist`.
const SOURCE_FIRST = ["source", "import", "module", "browser", "default"];

// Layout tests measure real boxes, so they run in chromium.
const LAYOUT_TESTS = "src/**/*.layout.test.{ts,tsx}";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: { conditions: SOURCE_FIRST },
  ssr: { resolve: { conditions: SOURCE_FIRST } },
  test: {
    globals: true,
    testTimeout: REACTOR_BOOT_TIMEOUT_MS,
    hookTimeout: REACTOR_BOOT_TIMEOUT_MS,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: [...defaultExclude, LAYOUT_TESTS],
          // Parallel PGlite boots thrash rather than overlap.
          fileParallelism: false,
        },
      },
      {
        extends: true,
        optimizeDeps: { exclude: ["@electric-sql/pglite"] },
        define: { "process.env": {} },
        test: {
          name: "layout",
          include: [LAYOUT_TESTS],
          browser: {
            provider: playwright(),
            enabled: true,
            headless: true,
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
