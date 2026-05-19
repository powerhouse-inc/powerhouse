// @ts-check
// Slim config: ESLint runs eslint-plugin-better-tailwindcss only (oxlint-
// tailwindcss can't load this monorepo's design-system CSS pre-build —
// it relies on the package `exports` field which points at dist). All
// other linting + formatting moved to oxlint + oxfmt.
//
// Plugins registered with no rules are kept here so that existing
// inline `eslint-disable <rule>` comments referencing them still
// resolve.

import betterTailwindcss from "eslint-plugin-better-tailwindcss";
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

const tailwindRules = {
  ...betterTailwindcss.configs["recommended-error"].rules,
  "better-tailwindcss/enforce-consistent-line-wrapping": ["off"],
  "better-tailwindcss/no-unknown-classes": [
    "error",
    {
      ignore: ["custom-class", "hover-bg-transparent", "skeleton-loader"],
    },
  ],
};

const tailwindConfig = [
  {
    files: ["packages/design-system/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ignores: ["packages/design-system/src/powerhouse/components/legacy/**"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: {
      "better-tailwindcss": {
        cwd: "./packages/design-system",
        entryPoint: "style.css",
      },
    },
  },
  {
    files: ["apps/connect/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: {
      "better-tailwindcss": {
        cwd: "./apps/connect",
        entryPoint: "style.css",
      },
    },
  },
  {
    files: ["packages/powerhouse-vetra-packages/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: {
      "better-tailwindcss": {
        cwd: "./packages/powerhouse-vetra-packages",
        entryPoint: "style.css",
      },
    },
  },
  {
    files: ["packages/vetra/**/*.{js,jsx,cjs,mjs,ts,tsx}"],
    ...betterTailwindcss.configs["recommended-error"],
    rules: tailwindRules,
    settings: {
      "better-tailwindcss": {
        cwd: "./packages/vetra",
        entryPoint: "style.css",
      },
    },
  },
];

export default defineConfig(
  globalIgnores(ignoredFiles),
  parser,
  registrations,
  ...tailwindConfig,
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
);
