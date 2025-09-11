import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    alias: {
      "#utils/env": new URL("./src/document/utils/node.ts", import.meta.url)
        .pathname,
      "#": new URL("./src/", import.meta.url).pathname,
    },
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
