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
    include: ["test/**/*.test.ts"],
    globals: true,
  },
});
