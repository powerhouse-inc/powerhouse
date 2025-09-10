import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
    exclude: ["src/codegen/__tests__/.out/**/*"],
    setupFiles: ["src/codegen/__tests__/setup-tests.ts"],
  },
  resolve: {
    dedupe: ["graphql"],
  },
});
