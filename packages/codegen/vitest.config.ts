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
    include: [
      "src/codegen/scalar-codegen-golden.test.ts",
      "src/codegen/project-scalar-codegen.test.ts",
      "src/codegen/migrate-package-json.test.ts",
      "src/codegen/features.test.ts",
      "src/utils/validation.test.ts",
      "src/utils/source-files.test.ts",
      "src/create-lib/initial-commit.test.ts",
      "src/codegen/generate-apps.test.ts",
      "src/codegen/generate-processors.test.ts",
      "src/codegen/generate.test.ts",
      "src/codegen/project-dir.test.ts",
      "src/codegen/migrate-tsconfig.test.ts",
      "src/codegen/migrate-powerhouse-config.test.ts",
      "src/codegen/install-added-dependencies.test.ts",
      "src/codegen/migrate.test.ts",
      "src/codegen/migrate-package-json.test.ts",
      "src/codegen/kysely.test.ts",
      "src/file-builders/manifest.test.ts",
      "src/file-builders/pieces.test.ts",
      "src/file-builders/subgraphs.test.ts",
      "src/name-builders/derive-piece-id.test.ts",
      "src/file-builders/boilerplate/package.json.test.ts",
      "src/file-builders/boilerplate/project-ports.test.ts",
      "src/file-builders/boilerplate/agent-files.test.ts",
      "src/file-builders/boilerplate/agent-skills.test.ts",
      "src/file-builders/boilerplate/generated-project-files.test.ts",
      "src/file-builders/boilerplate/generated-hosts.test.ts",
      "src/file-builders/hosts/outputs-file.test.ts",
      "src/file-builders/boilerplate/migrate-style.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
