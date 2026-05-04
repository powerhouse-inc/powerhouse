import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Scoped to schema tests for now. Other shared test suites (clis/tests/*,
    // analytics/test/*, etc.) ran outside vitest before this config existed
    // and have their own runners / environment requirements; folding them in
    // is a separate effort.
    include: [
      "clis/source-config-schema.test.ts",
      "connect/env-to-runtime-config.test.ts",
    ],
    globals: true,
  },
});
