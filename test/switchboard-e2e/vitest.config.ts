import { defaultExclude, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 60000, // 60 seconds for E2E tests
    hookTimeout: 120000, // 2 minutes for setup/teardown
    include: [
      "tests/**/*.test.ts", // Only E2E tests in tests folder
      "unit/**/*.test.ts", // Unit tests if any
    ],
    exclude: [
      ...defaultExclude,
      "**/dist/**",
      "**/node_modules/**",
      "document-models/**", // Exclude all document-models folder
      "processors/**", // Exclude processors folder  
      "subgraphs/**", // Exclude subgraphs folder
    ],
    globalSetup: ["./tests/global-setup.ts"],
  },
});
