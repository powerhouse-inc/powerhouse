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
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
