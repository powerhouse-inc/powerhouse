import { defineConfig } from "vitest/config";

// The integration suite provisions real in-process reactors (a PGlite WASM cold
// boot plus the reactor migrations each), which takes seconds rather than
// milliseconds -- the same reason reactor-monitor raises these.
const REACTOR_BOOT_TIMEOUT_MS = 60_000;

// Resolve workspace packages through their "source" export condition so a test
// reads @powerhousedao/reactor's TypeScript rather than a `dist/` that may
// predate it. Required on `ssr.resolve` too: vitest's node pool resolves
// through the SSR environment, where `resolve.conditions` alone leaves it on
// "import" and so on a stale `dist`.
const SOURCE_FIRST = ["source", "import", "module", "browser", "default"];

export default defineConfig({
  resolve: { conditions: SOURCE_FIRST },
  ssr: { resolve: { conditions: SOURCE_FIRST } },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    // Every reactor in the integration suite boots a PGlite; running those
    // files in parallel on a developer machine thrashes rather than overlaps.
    fileParallelism: false,
    testTimeout: REACTOR_BOOT_TIMEOUT_MS,
    hookTimeout: REACTOR_BOOT_TIMEOUT_MS,
  },
});
