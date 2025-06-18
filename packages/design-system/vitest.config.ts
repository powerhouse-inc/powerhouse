import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./setupTests.js"],
    alias: {
      "#": new URL("./dist/src/", import.meta.url).pathname,
      "#powerhouse": new URL("./src/powerhouse/", import.meta.url).pathname,
      "#ui": new URL("./src/ui/", import.meta.url).pathname,
      "#connect": new URL("./src/connect/", import.meta.url).pathname,
      "#rwa": new URL("./src/rwa/", import.meta.url).pathname,
    },
  },
});
