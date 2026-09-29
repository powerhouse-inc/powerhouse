import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
