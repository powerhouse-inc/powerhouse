// @ts-check
// Vestigial ESLint config: registers plugins (no rules enabled) only so
// that existing inline `eslint-disable <rule>` comments in source files
// continue to resolve without errors. All linting moved to oxlint
// (.oxlintrc.json) and all formatting moved to oxfmt (.oxfmtrc.json).
//
// Delete this file once the inline disable comments are cleaned up.

import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import loggerPlugin from "./eslint-plugins/logger.js";

const parser = {
  files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
};

const registrations = {
  files: [
    "**/*.ts",
    "**/*.tsx",
    "**/*.mts",
    "**/*.cts",
    "**/*.js",
    "**/*.mjs",
    "**/*.cjs",
  ],
  plugins: {
    "@typescript-eslint": tseslint.plugin,
    "react-hooks": reactHooks,
    logger: loggerPlugin,
  },
};

export default defineConfig(
  globalIgnores(["**/node_modules/", "**/dist/", "**/coverage/", "**/.tsbuild/"]),
  parser,
  registrations,
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
);
