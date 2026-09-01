import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The package imports its own barrels through tsconfig "paths"
    // ("templates", "file-builders", ...), so tests need those resolved.
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    // Scoped include. The two suites under src/templates/document-model/tests
    // predate this config and have never been wired into the workspace runner;
    // folding them in is a separate effort from this change.
    include: ["src/file-builders/boilerplate/project-ports.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
