import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    // PGlite WASM init + close cycles routinely take >5s on slower CI
    // runners; bump the default to keep the snapshot tests stable. The
    // Windows runner is slower again -- the close/reopen and SIGKILL-recovery
    // tests measured ~36s there against ~7s on ubuntu.
    testTimeout: 120_000,
  },
});
