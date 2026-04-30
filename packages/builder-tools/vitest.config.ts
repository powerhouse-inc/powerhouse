import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["connect-utils/**/*.test.ts"],
    globals: true,
  },
});
