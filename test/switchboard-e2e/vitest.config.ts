import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    environment: "node",
    testTimeout: 30000, // 30s for integration-style unit tests
    poolOptions: {
      forks: {
        singleFork: true,
        isolate: true,
      },
    },
    include: [
      "unit/**/*.test.ts",
      "document-models/**/*.test.ts",
      "processors/**/*.test.ts",
      "subgraphs/**/*.test.ts",
    ],
    exclude: [
      ...defaultExclude,
      "**/tests/**", // E2E tests (Playwright) are in tests/ folder
      "**/dist/**",
    ],
    globals: true,
    passWithNoTests: true,
  },
});
