import { fixupPluginRules } from "@eslint/compat";
import { default as eslint } from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import tailwind from "eslint-plugin-tailwindcss";
import globals from "globals";
import tseslint from "typescript-eslint";

const reactRuleOverrides = {
  disabled: {
    "react/require-default-props": "off",
    "react/jsx-no-literals": "off",
    "react/forbid-component-props": "off",
    "react/no-multi-comp": "off",
    "react/destructuring-assignment": "off",
    "react/function-component-definition": "off",
    "react/prop-types": "off",
  },
  warn: {
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
};

const typescriptRuleOverrides = {
  disabled: {
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
  },
  warn: {
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
};

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.stylisticTypeChecked,
  ...tseslint.configs.strictTypeChecked,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
  ...tailwind.configs["flat/recommended"],
  eslintPluginPrettierRecommended,
  {
    ignores: [
      "node_modules/",
      "dist/",
      "build/",
      "storybook-static/",
      "coverage/",
      ".nx/",
      "gen/",
      "docs/",
      "coverage/",
      "browser.js",
      "packages/*/node_modules/",
      "packages/*/dist/",
      "packages/*/build/",
      "packages/*/storybook-static/",
      "packages/*/coverage/",
      "packages/*/gen/",
      "packages/*/docs/",
      "packages/*/.storybook/",
      "packages/document-drive/test/*",
    ],
  },
  {
    languageOptions: {
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
      tailwindcss: {
        callees: [
          "classnames",
          "clsx",
          "ctl",
          "twMerge",
          "twJoin",
          "mergeClassNameProps",
        ],
      },
    },
  },
  {
    rules: {
      ...typescriptRuleOverrides.disabled,
      ...typescriptRuleOverrides.warn,
    },
  },
  {
    files: ["**/*.{tsx}"],
    ...reactPlugin.configs.flat.all,
    ...reactPlugin.configs.flat["jsx-runtime"],
    settings: {
      react: {
        version: "detect",
      },
    },
    plugins: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      "react-hooks": fixupPluginRules(reactHooksPlugin),
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    rules: {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      ...reactHooksPlugin.configs.recommended.rules,
      ...reactRuleOverrides.disabled,
      ...reactRuleOverrides.warn,
    },
  },
);
