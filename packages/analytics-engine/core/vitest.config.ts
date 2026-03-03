import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 5000,
    setupFiles: "./test/vitest.setup.ts",
    maxWorkers: 1,
    isolate: false,
  },
});
