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
    environment: "node",
    testTimeout: 5000,
    server: {
      deps: {
        inline: ["@powerhousedao/analytics-engine-core"],
      },
    },
    setupFiles: "./test/vitest.setup.ts",
    passWithNoTests: true,
    maxWorkers: 1,
    isolate: false,
  },
});
