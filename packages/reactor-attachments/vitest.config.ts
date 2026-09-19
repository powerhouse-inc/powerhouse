import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    // These suites provision a real database and storage path per test, which
    // vitest's 5s default does not cover on a loaded CI runner -- the
    // hash-first upload tests timed out at 5.1s there while passing in ~1s
    // locally.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    alias: {
      "#": new URL("./src/", import.meta.url).pathname,
    },
  },
});
