import { defineConfig } from "vitest/config";

// Provisioning a reactor stands up a whole PGlite (WASM cold boot plus the
// reactor migrations), which takes seconds rather than milliseconds — the
// same reason packages/reactor and reactor-browser raise these.
const REACTOR_BOOT_TIMEOUT_MS = 60_000;

// Resolve workspace packages through their "source" export condition, so a
// test reads @powerhousedao/reactor's TypeScript rather than a `dist/` that
// may predate it. This has to be set on `ssr.resolve` as well as `resolve`:
// vitest's node pool resolves through the SSR environment, and
// `resolve.conditions` alone leaves it on "import" -> a stale `dist`.
const SOURCE_FIRST = ["source", "import", "module", "browser", "default"];

export default defineConfig({
  resolve: { conditions: SOURCE_FIRST },
  ssr: { resolve: { conditions: SOURCE_FIRST } },
  test: {
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    globals: true,
    // Every file in this suite boots at least one PGlite; running them in
    // parallel on a developer machine thrashes rather than overlaps.
    fileParallelism: false,
    testTimeout: REACTOR_BOOT_TIMEOUT_MS,
    hookTimeout: REACTOR_BOOT_TIMEOUT_MS,
  },
});
