import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@powerhousedao/reactor": new URL(
        "../reactor/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
  },
});
