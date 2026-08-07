import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["editors/**/*.test.ts"],
    exclude: ["**/helpers.test.ts"],
    globals: true,
  },
});
