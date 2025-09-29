import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "custom",
      customProviderModule: "vitest-monocart-coverage",
    },
    projects: [
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
      "clis/*/vitest.config.ts",
    ],
  },
});
