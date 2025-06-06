import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/__tests__/**/*.test.ts"],
  },
  resolve: {
    dedupe: ["graphql"],
  },
});
