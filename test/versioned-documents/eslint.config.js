// @ts-check
import { default as eslint } from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** These files are typically ignored by eslint by default, so there is no need to investigate why they are ignored. */
const ignoredFiles = [
  "**/node_modules/",
  "**/dist/",
  "**/.ph/",
  "**/.tsbuild/",
  "**/ts-build/",
  "**/storybook-static/",
  "**/.vite/",
];

/** Global configs for eslint ignores */
const ignored = globalIgnores(ignoredFiles);

/** Typescript (`.ts`) files */
const typescriptFiles = ["**/*.ts"];

/** Typescript React (`.tsx`) files */
const typescriptReactFiles = ["**/*.tsx"];

/** Javascript (`.js`, `.cjs`, `.mjs`) files */
const javascriptFiles = ["**/*.js", "**/*.cjs", "**/*.mjs"];

/** Typescript rules that we have chosen to opt out of in general */
/** @type {import("eslint").Linter.RulesRecord} */
const typescriptRules = {
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      prefer: "type-imports",
      disallowTypeAnnotations: true,
      fixStyle: "separate-type-imports",
    },
  ],
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-unused-vars": [
    "warn",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "@typescript-eslint/no-unnecessary-condition": "warn",
  "@typescript-eslint/require-await": "warn",
  "@typescript-eslint/no-misused-promises": "warn",
  "@typescript-eslint/no-floating-promises": "warn",
  "@typescript-eslint/no-empty-object-type": "warn",
  "@typescript-eslint/no-duplicate-type-constituents": "warn",
  "@typescript-eslint/restrict-template-expressions": [
    "warn",
    {
      allowNumber: true,
    },
  ],
};

/** Language options for typescript files 
@type {import("eslint").Linter.LanguageOptions} */
const typescriptLanguageOptions = {
  sourceType: "module",
  ecmaVersion: "latest",
  globals: {
    ...globals.browser,
    ...globals.node,
  },
  parserOptions: {
    projectService: {
      allowDefaultProject: ["eslint.config.js", "vitest.config.ts"],
    },
    tsconfigRootDir: import.meta.dirname,
    ecmaFeatures: {
      jsx: true,
    },
  },
};

/** React plugins */
const reactPlugins = {
  react: reactPlugin,
  "react-hooks": reactHooksPlugin,
};

/** React settings */
const reactSettings = {
  react: {
    version: "detect",
  },
};

/** Typescript config for both `.ts` and `.tsx` files */
const typescriptConfig = {
  files: [...typescriptFiles, ...typescriptReactFiles],
  languageOptions: typescriptLanguageOptions,
  rules: typescriptRules,
};

/** React config for `.tsx` files */
const reactConfig = {
  files: typescriptReactFiles,
  settings: reactSettings,
  plugins: reactPlugins,
};

/** Config for javascript files */
const javascriptConfig = {
  // disable type aware linting for js files
  files: javascriptFiles,
  extends: [tseslint.configs.disableTypeChecked],
};

/** Recommended config from eslint */
const eslintRecommendedConfig = eslint.configs.recommended;

/** Recommended config from typescript-eslint */
const typescriptEsLintRecommendedConfig = [
  ...tseslint.configs.recommendedTypeChecked,
];

/** Generated code emits `eslint-disable` directives defensively; simple
 * schemas don't trigger the disabled rule, so the directive reads as
 * "unused". The source of truth is the codegen template, not the emitted
 * file — don't flag unused directives in generated files. */
const generatedFilesConfig = {
  files: ["**/gen/**/*.{ts,tsx}"],
  linterOptions: {
    reportUnusedDisableDirectives: "off",
  },
  rules: {
    // Generated reducers cast through `any`; this is inherent to the codegen
    // output and not worth fighting per-file.
    "@typescript-eslint/no-unsafe-argument": "off",
    "@typescript-eslint/no-unsafe-member-access": "off",
    "@typescript-eslint/no-unsafe-assignment": "off",
    "@typescript-eslint/no-unsafe-call": "off",
    "@typescript-eslint/no-unsafe-return": "off",
  },
};

/** Main config */
export default defineConfig(
  ignored,
  eslintRecommendedConfig,
  typescriptEsLintRecommendedConfig,
  typescriptConfig,
  reactConfig,
  javascriptConfig,
  eslintPluginPrettierRecommended,
  generatedFilesConfig,
);
