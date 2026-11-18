import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
    },
    projects: [
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
      "clis/*/vitest.config.ts",
      "test/*/vitest.config.ts",
    ],
  },
});
