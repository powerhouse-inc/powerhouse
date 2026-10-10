import { defineConfig } from "vitest/config";

// Read workspace packages from source, so a test never runs against a stale
// dist. The node pool resolves through ssr, hence both.
const SOURCE_FIRST = ["source", "import", "module", "browser", "default"];

// The integration suite boots real PGlite reactors.
const REACTOR_BOOT_TIMEOUT_MS = 60_000;

export default defineConfig({
  resolve: { conditions: SOURCE_FIRST },
  ssr: { resolve: { conditions: SOURCE_FIRST } },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    fileParallelism: false,
    testTimeout: REACTOR_BOOT_TIMEOUT_MS,
    hookTimeout: REACTOR_BOOT_TIMEOUT_MS,
  },
});
