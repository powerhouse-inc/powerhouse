import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the package's own tsconfig "paths" (e.g. "document-model" ->
    // ./document-model) so tests don't need a workspace dependency on the
    // document-model package, which would create a circular project reference.
    tsconfigPaths: true,
    alias: {
      // `document-model` is a thin re-export of this package's own
      // ./document-model. Alias it to the local source so document-drive tests
      // resolve at runtime without a workspace dependency on the document-model
      // package — that dependency would form a circular project graph (TS6202).
      "document-model": fileURLToPath(
        new URL("./document-model/index.ts", import.meta.url),
      ),
    },
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
      "registry/manifest-slim.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
