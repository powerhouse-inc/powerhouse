import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    alias: {
      "#": new URL("./src/", import.meta.url).pathname,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      exclude: [
        "test/**",
        "dist/**",
        "**/*.test.ts",
        "**/*.bench.ts",
        "**/types.ts",
      ],
    },
  },
});
