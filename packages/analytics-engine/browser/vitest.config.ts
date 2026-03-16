import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  ssr: {
    resolve: {
      conditions: ["source"],
    },
  },
  resolve: {
    conditions: ["source"],
  },
  assetsInclude: ["*.sql"],
  test: {
    browser: {
      provider: playwright(),
      enabled: true,
      instances: [{ browser: "firefox" }],
      headless: true,
    },
    testTimeout: 5000,
    setupFiles: "./test/vitest.setup.ts",
    passWithNoTests: true,
  },
  optimizeDeps: {
    exclude: ["@electric-sql/pglite"],
  },
  define: {
    "process.env": {},
  },
});
