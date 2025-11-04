import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: [
      "src/codegen/__tests__/data/**/*",
      "src/codegen/__tests__/.generate-editors-test-output/**/*",
      "src/codegen/__tests__/.generate-document-models-test-output/**/*",
      "src/codegen/__tests__/.generate-drive-editor-test-output/**/*",
    ],
    fileParallelism: false,
  },
  resolve: {
    dedupe: ["graphql"],
  },
});
