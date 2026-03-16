import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ["source"],
    },
  },
  resolve: {
    conditions: ["source"],
  },
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
