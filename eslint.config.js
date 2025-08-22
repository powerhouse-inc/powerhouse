import { default as eslint } from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import { globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const ignores = [
  // build artifacts
  "**/node_modules/",
  "**/dist/",
  "**/.ph/",
  "**/storybook-static/",
  "**/.vite/",
  "**/.nx/",
  "**/build/",
  "**/.docusaurus/",
  "**/.ph/",
  "**/prisma/",
  // config artifacts
  "**/babel.config.js",
  "commitlint.config.cjs",
  // test artifacts
  "**/external-packages.js",
  "**/.out/",
  "**/flaky/",
  // TODO: investigate why typescript disagrees with our storybook config
  "**/.storybook/",
  // TODO: investigate why our benchmark tests fail so many lint checks
  "**/*.bench.ts",
  // TODO: replace with something more robust
  "packages/codegen/src/codegen/__tests__/.test-project",
  // TODO: replace with something more robust
  "packages/codegen/src/codegen/.hygen/",
  // TODO: replace with something more robust
  "apps/connect/src/vite-env.d.ts",
  // TODO: these files had a blanket "eslint-disable" comment at the top and it was never re-enabled later in the file
  "packages/switchboard-gui/src/hooks/useAuth.ts",
  "packages/document-drive/src/storage/ipfs.ts",
  "packages/document-drive/src/utils/migrations.ts",
  "tools/scripts/release.ts",
];

const typescriptRules = {
  "@typescript-eslint/consistent-type-imports": [
    "error",
    {
      prefer: "type-imports",
      fixStyle: "inline-type-imports",
    },
  ],
  // we need to use `any` in our over zealous generics
  "@typescript-eslint/no-explicit-any": "off",
  // we use things like _ as a placeholder for unused variables
  "@typescript-eslint/no-unused-vars": "warn",
  // we have a lot of types that lie about whether they are optional or not
  "@typescript-eslint/no-unnecessary-condition": "warn",
  // we have a lot of functions which lie about whether they are async or not
  "@typescript-eslint/require-await": "warn",
  "@typescript-eslint/no-misused-promises": "warn",
  "@typescript-eslint/no-floating-promises": "warn",
  // our codegen uses this wrong type definition all over the place
  "@typescript-eslint/no-empty-object-type": "warn",
  // our overzealous generics force us to do this
  "@typescript-eslint/no-duplicate-type-constituents": "warn",
  // we tend to just turn off typescript without saying why
  "@typescript-eslint/ban-ts-comment": "off",
  // we use infinite loops
  "no-constant-condition": "off",
  // we use template literals with unsafe values
  "@typescript-eslint/restrict-template-expressions": [
    "warn",
    {
      allowNumber: true,
    },
  ],
  // our overzealous generics force us to do this
  "@typescript-eslint/no-unnecessary-type-assertion": "off",
  // our overzealous generics force us to do this
  "@typescript-eslint/no-unnecessary-type-parameters": "off",
};

// if code you wrote is being matched by the files list for these rules, you need to update it to be safe
// or at least change the types to `unknown` so that people can see that they are unsafe
const unsafeRules = {
  ...typescriptRules,
  "@typescript-eslint/no-unsafe-declaration-merging": "off",
  "@typescript-eslint/no-unsafe-assignment": "off",
  "@typescript-eslint/no-unsafe-member-access": "off",
  "@typescript-eslint/no-unsafe-call": "off",
  "@typescript-eslint/no-unsafe-return": "off",
  "@typescript-eslint/no-unsafe-argument": "off",
  "@typescript-eslint/await-thenable": "off",
  "@typescript-eslint/no-require-imports": "off",
  "@typescript-eslint/no-base-to-string": "off",
  "@typescript-eslint/unbound-method": "off",
  "@typescript-eslint/no-namespace": "off",
  "prefer-const": "off",
};

export default tseslint.config(
  globalIgnores(ignores),
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "vitest.workspace.ts",
            "vitest.config.ts",
            "eslint.config.js",
            // TODO: remove this once we have a better way to handle release scripts
            "tools/scripts/release.ts",
            // TODO: remove this once we have a better way to handle storybook
            "packages/.storybook/*",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // @ts-expect-error - figure out how to use a js type annotation here
    rules: typescriptRules,
  },
  {
    files: ["**/*.tsx"],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      ...typescriptRules,
    },
  },
  {
    // disable type checking for js files
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    extends: [tseslint.configs.recommendedTypeChecked],
    files: [
      // it's probably fine to be less strict with academy
      "apps/academy/**/*",
      // our tests make heavy use of unsafe like `any` etc.
      "**/test/*.ts",
      "**/test/*.tsx",
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/*.bench.ts",
      "**/__tests__/*.ts",
      "apps/connect/cypress/e2e/**/*",
      // TODO: replace with something more robust
      "packages/document-drive/src/utils/logger.ts",
      // TODO: our generated code should not be unsafe
      "**/gen/*.ts",
      // TODO: figure out why the type of viteEnvs is unsafe
      "apps/connect/vite.config.ts",
      // TODO: replace codegen templates with something safe
      "packages/codegen/src/codegen/.hygen/templates/**/*",
      // TODO: file system utils call functions which are not implemented and just throw errors
      "packages/document-model/src/document/utils/file.ts",
      "apps/connect/scripts/render-skeleton.ts",
      "apps/connect/src/components/modal/modals/DebugSettingsModal.tsx",
      "apps/connect/src/context/read-mode.tsx",
      "packages/builder-tools/connect-studio/server.ts",
      "packages/codegen/src/codegen/hygen.ts",
      "packages/design-system/src/connect/components/toast/toast.stories.tsx",
      "clis/ph-cli/src/services/dev.ts",
      "packages/design-system/src/powerhouse/utils/fixedForwardRef.ts",
      "packages/design-system/src/ui/components/value-transformer/value-transformer.tsx",
      "packages/document-drive/src/processors/relational.ts",
      "packages/document-drive/src/server/listener/transmitter/internal.ts",
      "packages/document-drive/src/utils/run-asap.ts",
      "packages/document-model/src/document/utils/document-helpers.ts",
      "packages/document-drive/src/utils/graphql.ts",
      "packages/reactor/src/events/types.ts",
      "packages/reactor-api/src/packages/util.ts",
      "packages/vetra/subgraphs/vetra-package/resolvers.ts",
      "packages/reactor-browser/src/context/read-mode.tsx",
      "packages/document-model/src/document/object.ts",
      "packages/switchboard-gui/src/components/header/header.tsx",
      "packages/reactor-mcp/src/server.ts",
      "packages/reactor-api/src/server.ts",
      "packages/reactor-api/src/graphql/index.ts",
      "packages/document-model/src/document/reducer.ts",
      "packages/document-drive/src/read-mode/server.ts",
      "packages/document-drive/src/queue/event.ts",
    ],
    rules: unsafeRules,
  },
);
