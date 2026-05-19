// @ts-check
// Slimmed config: ESLint is responsible only for the things oxlint
// cannot do — Prettier formatting and tailwind class validation. All
// other rules (typescript-eslint type-aware, react-hooks, custom
// logger/cli-cold-path plugins, eslint core) run via oxlint.
//
// Run `pnpm lint:ox` first for the fast pass; this ESLint config is the
// formatter/tailwind gate.

import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactHooks from "eslint-plugin-react-hooks";
import loggerPlugin from "./eslint-plugins/logger.js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

// Parser only — no rules. typescript-eslint's recommended rules are now
// enforced by oxlint with type-aware linting.
const typescriptParserConfig = {
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

// Register plugins (but enable no rules) so existing inline
// `eslint-disable <rule>` comments resolve. ESLint errors on disable
// directives that reference unknown rules; the actual checks run via
// oxlint.
const pluginsRegistrationOnly = {
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
  typescriptParserConfig,
  pluginsRegistrationOnly,
  // Prettier: runs prettier as an ESLint rule. Formatting-only.
  eslintPluginPrettierRecommended,
  // Tailwind class validation for packages that use Tailwind.
  ...tailwindConfig,
  // Disable per-config noise from unused-disable directives that reference
  // rules now lived in oxlint (react-hooks, logger, cli-cold-path).
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
);
