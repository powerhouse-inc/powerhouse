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
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./setupTests.js"],
  },
});
