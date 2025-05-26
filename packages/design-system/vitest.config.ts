import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./setupTests.js"],
    alias: {
      "#": new URL("./dist/src/", import.meta.url).pathname,
    },
  },
});
