import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/codegen/__tests__/**/*.test.ts",
      "src/file-builders/**/*.test.ts",
    ],
    exclude: [
      "src/codegen/__tests__/data/**/*",
      "src/codegen/__tests__/.test-output/**/*",
    ],
    fileParallelism: false,
    globalSetup: "./src/codegen/__tests__/global-setup.ts",
  },
  resolve: {
    dedupe: ["graphql"],
  },
});
