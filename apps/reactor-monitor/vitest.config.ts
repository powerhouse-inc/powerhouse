import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

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
// stale `dist` (the finding behind packages/reactor-monitor's W0.2 report).
const SOURCE_FIRST = ["source", "import", "module", "browser", "default"];

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  resolve: { conditions: SOURCE_FIRST },
  ssr: { resolve: { conditions: SOURCE_FIRST } },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    globals: true,
    // Every test that provisions a reactor boots at least one PGlite;
    // running them in parallel on a developer machine thrashes rather than
    // overlaps.
    fileParallelism: false,
    testTimeout: REACTOR_BOOT_TIMEOUT_MS,
    hookTimeout: REACTOR_BOOT_TIMEOUT_MS,
  },
});
