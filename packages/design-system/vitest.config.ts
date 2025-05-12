import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./setupTests.js"],
    alias: {
      "#": new URL("./dist/src/", import.meta.url).pathname,
    },
  },
});
