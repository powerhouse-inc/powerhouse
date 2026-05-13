import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    // PGlite WASM init + close cycles routinely take >5s on slower CI
    // runners; bump the default to keep the snapshot tests stable.
    testTimeout: 30_000,
  },
});
