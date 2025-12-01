// @ts-check
import { default as eslint } from "@eslint/js";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";
import { globalIgnores } from "eslint/config";

/** Typescript (`.ts`) files */
const typescriptFiles = ["**/*.ts"];

/** Typescript React (`.tsx`) files */
const typescriptReactFiles = ["**/*.tsx"];

/** Javascript (`.js`, `.cjs`, `.mjs`) files */
const javascriptFiles = ["**/*.js", "**/*.cjs", "**/*.mjs"];

export default tseslint.config(
  globalIgnores(["node_modules/", "dist/", ".ph/", "eslint.config.js"]),
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: [...typescriptFiles, ...typescriptReactFiles, ...javascriptFiles],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          disallowTypeAnnotations: false,
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: [typescriptReactFiles],
    ...reactPlugin.configs.flat.recommended,
    ...reactPlugin.configs.flat["jsx-runtime"],
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
  },
);
