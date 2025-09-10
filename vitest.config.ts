import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // "packages/codegen/vitest.config.ts",
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
      "clis/*/vitest.config.ts",
    ],
  },
});
