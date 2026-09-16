// Codemod config for scripts/sync-upstream.mts: only the fixable rules the
// vendored tree needs under verbatimModuleSyntax, plus the repo's prettier.
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: packageRoot,
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "@typescript-eslint/consistent-type-exports": [
        "error",
        { fixMixedExportsWithInlineTypeSpecifier: false },
      ],
    },
  },
  eslintPluginPrettierRecommended,
];
