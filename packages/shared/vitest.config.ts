import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the package's own tsconfig "paths" (e.g. "document-model" ->
    // ./document-model) so tests don't need a workspace dependency on the
    // document-model package, which would create a circular project reference.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    // Scoped include: the schema/connect suites plus the document-drive tests.
    // Other shared test suites (clis/tests/* hit the npm registry, etc.) have
    // their own runners / environment requirements; folding them in is a
    // separate effort.
    include: [
      "clis/source-config-schema.test.ts",
      "connect/config-loader.test.ts",
      "connect/env-config.test.ts",
      "connect/entrypoint-seed.test.ts",
      "document-drive/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
