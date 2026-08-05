import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["editors/document-model-editor/**/*.test.ts"],
    exclude: ["**/helpers.test.ts"],
    globals: true,
  },
});
