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
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
