import { coverageConfigDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["test", "json", "lcov", "html"],
      exclude: [
        ...coverageConfigDefaults.exclude,
        "**/dist/**",
        "**/tests/**",
        "**/coverage/**",
        "**/cypress/**",
        "**/storybook-static/**",
        "tools/**",
        "apps/academy/**",
        "packages/document-drive/src/storage/prisma/client/**",
      ],
    },
    projects: [
      "packages/*/vitest.config.ts",
      "apps/*/vitest.config.ts",
      "clis/*/vitest.config.ts",
    ],
  },
});
