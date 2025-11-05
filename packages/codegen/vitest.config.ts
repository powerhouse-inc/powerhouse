import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/codegen/__tests__/**/*.test.ts"],
    exclude: [
      "src/codegen/__tests__/data/**/*",
      "src/codegen/__tests__/.test-output/**/*",
    ],
    fileParallelism: false,
  },
  resolve: {
    dedupe: ["graphql"],
  },
});
