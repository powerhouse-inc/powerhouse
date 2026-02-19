import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 120000,
    include: ["**/*.e2e.test.ts"],
    globalSetup: "./global-setup.ts",
    teardownTimeout: 10000,
  },
});
