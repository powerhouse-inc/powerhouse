import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    alias: {
      "#": new URL("./src/", import.meta.url).pathname,
    },
  },
});
