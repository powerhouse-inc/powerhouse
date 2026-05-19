// @ts-check
// Minimal config: ESLint only registers plugins (no rules) so that
// existing inline `eslint-disable <rule>` comments resolve. All linting
// and formatting now happens via oxlint + oxfmt:
//
//   pnpm lint:ox    oxlint (rules, type-aware, custom plugins, tailwind)
//   pnpm format     oxfmt  (replaces prettier)
//
// This file remains only to satisfy inline disable comments left in
// source from the previous ESLint setup. Delete once those are cleaned up.

import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import loggerPlugin from "./eslint-plugins/logger.js";

const ignoredFiles = [
  "**/node_modules/",
  "**/coverage/",
  "**/dist/",
  "**/.tsbuild/",
  "**/ts-build/",
  "**/storybook-static/",
  "**/.vite/",
  "**/.nx/",
  "**/build/",
  "**/.docusaurus/",
  "**/.ph/",
  "**/.hotseat/",
  "**/prisma/",
  "**/babel.config.js",
  "commitlint.config.cjs",
  "**/.out/",
  "**/test-output/",
  "**/.test-output/",
  "**/test-projects/",
  "**/flaky/",
  "apps/connect/lib/",
  "apps/switchboard-lb/test/integration/*.js",
  "clis/ph-cli/src/commands/migrations/templates",
  "clis/ph-cmd/legacy/**",
  "**/playwright-report/",
  "test/package-e2e/.registry-storage/",
  "test/package-e2e/.registry-cdn-cache/",
  "test/package-e2e/fixtures/",
  "**/.storybook/",
  "**/*.bench.ts",
  "packages/codegen/src/codegen/.hygen/",
  "apps/connect/src/vite-env.d.ts",
  "packages/switchboard-gui/src/hooks/useAuth.ts",
  "packages/document-drive/src/storage/ipfs.ts",
  "packages/document-drive/src/utils/migrations.ts",
  "tools/scripts/release.ts",
  "releases/release.ts",
  "**/external-packages.js",
  "packages/reactor/test/atlas/**/*",
  "packages/reactor-api/src/packages/vite-loader.mts",
];

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
  globalIgnores(ignoredFiles),
  parser,
  registrations,
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
);
