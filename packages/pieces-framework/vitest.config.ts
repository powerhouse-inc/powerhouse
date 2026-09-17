import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
    // The dist test parses a 765 KB declaration bundle with ts-morph; a Windows
    // runner needs more than the default five seconds for it.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
