// @ts-check
import { default as eslint } from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tailwind from "eslint-plugin-tailwindcss";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  ...tailwind.configs["flat/recommended"],
  eslintPluginPrettierRecommended,
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "storybook-static/",
      "coverage/",
      "gen/",
      "docs/",
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/storybook-static/",
      "**/.storybook/",
      "**/coverage/",
      "**/gen/",
      "**/docs/",
      "**/browser.js",
      "**/src/assets/**/*",
      "**/postcss.config.js",
      "**/postcss.config.cjs",
      "**/postcss.config.mjs",
      "**/create-require.js",
      ".nx/",
      "packages/document-drive/test/*",
      "**/.vite/",
      "**/out/",
      "**/forge.config.js",
      "**/vite.config.ts.timestamp-*.mjs",
      "apps/connect/src/vite-env.d.ts",
    ],
  },
  {
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "**/*.config.js",
            "**/*.config.mjs",
            "**/*.config.cjs",
          ],
        },
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      tailwindcss: {
        callees: [
          "classnames",
          "clsx",
          "ctl",
          "twMerge",
          "twJoin",
          "mergeClassNameProps",
          "cn",
        ],
        whitelist: [
          "scrollbar-thin",
          "scrollbar-thumb-gray-300",
          "scrollbar-thumb-gray-600",
          "scrollbar-track-transparent",
          "scrollbar-track-gray-900",
        ],
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/prefer-function-type": "off",
      "@typescript-eslint/strict-boolean-expressions": "off",
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/prefer-reduce-type-parameter": "off",
      "@typescript-eslint/prefer-for-of": "warn",
      "@typescript-eslint/require-await": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/unbound-method": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "@typescript-eslint/prefer-find": "warn",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "warn",
      "@typescript-eslint/restrict-plus-operands": "warn",
      "@typescript-eslint/return-await": "warn",
      "@typescript-eslint/no-dynamic-delete": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/no-unnecessary-type-parameters": "warn",
      "@typescript-eslint/restrict-template-expressions": [
        "warn",
        {
          allowNumber: true,
        },
      ],
    },
  },
  {
    files: ["**/*.tsx"],
    ...reactPlugin.configs.flat.all,
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
    rules: {
      "react/require-default-props": "off",
      "react/jsx-no-literals": "off",
      "react/forbid-component-props": "off",
      "react/no-multi-comp": "off",
      "react/destructuring-assignment": "off",
      "react/function-component-definition": "off",
      "react/prop-types": "off",
      "react/no-unused-prop-types": "warn",
      "react/jsx-max-depth": "warn",
      "react/no-array-index-key": "warn",
      "react/jsx-no-bind": "warn",
      "react/button-has-type": "warn",
      "react/hook-use-state": "warn",
      "react/jsx-no-useless-fragment": "warn",
      "react/jsx-props-no-spreading": [
        "warn",
        {
          html: "ignore",
        },
      ],
    },
  },
);
