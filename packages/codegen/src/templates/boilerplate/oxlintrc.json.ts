import { json } from "@tmpl/core";

export const oxlintConfigTemplate = json`
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxlint/configuration_schema.json",
  "plugins": ["typescript", "react", "react-hooks"],
  "categories": { "correctness": "error" },
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/.ph/**",
    "**/storybook-static/**",
    "**/.vite/**"
  ],
  "rules": {
    "typescript/await-thenable": "error",
    "typescript/ban-ts-comment": "error",
    "typescript/no-array-constructor": "error",
    "typescript/no-array-delete": "error",
    "typescript/no-base-to-string": "error",
    "typescript/no-duplicate-enum-values": "error",
    "typescript/no-extra-non-null-assertion": "error",
    "typescript/no-for-in-array": "error",
    "typescript/no-implied-eval": "error",
    "typescript/no-misused-new": "error",
    "typescript/no-namespace": "error",
    "typescript/no-non-null-asserted-optional-chain": "error",
    "typescript/no-redundant-type-constituents": "error",
    "typescript/no-require-imports": "error",
    "typescript/no-this-alias": "error",
    "typescript/no-unnecessary-type-assertion": "error",
    "typescript/no-unnecessary-type-constraint": "error",
    "typescript/no-unsafe-argument": "error",
    "typescript/no-unsafe-assignment": "error",
    "typescript/no-unsafe-call": "error",
    "typescript/no-unsafe-declaration-merging": "error",
    "typescript/no-unsafe-enum-comparison": "error",
    "typescript/no-unsafe-function-type": "error",
    "typescript/no-unsafe-member-access": "error",
    "typescript/no-unsafe-return": "error",
    "typescript/no-unsafe-unary-minus": "error",
    "typescript/no-unused-expressions": "error",
    "typescript/no-wrapper-object-types": "error",
    "typescript/only-throw-error": "error",
    "typescript/prefer-as-const": "error",
    "typescript/prefer-namespace-keyword": "error",
    "typescript/prefer-promise-reject-errors": "error",
    "typescript/restrict-plus-operands": "error",
    "typescript/triple-slash-reference": "error",
    "typescript/unbound-method": "error",
    "typescript/consistent-type-imports": [
      "error",
      {
        "prefer": "type-imports",
        "disallowTypeAnnotations": true,
        "fixStyle": "separate-type-imports"
      }
    ],
    "typescript/no-explicit-any": "off",
    "typescript/no-unused-vars": [
      "warn",
      {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_"
      }
    ],
    "typescript/no-unnecessary-condition": "warn",
    "typescript/require-await": "warn",
    "typescript/no-misused-promises": "warn",
    "typescript/no-floating-promises": "warn",
    "typescript/no-empty-object-type": "warn",
    "typescript/no-duplicate-type-constituents": "warn",
    "typescript/restrict-template-expressions": ["warn", { "allowNumber": true }],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
  },
  "overrides": [
    {
      "files": ["**/*.js", "**/*.cjs", "**/*.mjs"],
      "rules": {
        "typescript/await-thenable": "off",
        "typescript/no-array-delete": "off",
        "typescript/no-base-to-string": "off",
        "typescript/no-duplicate-type-constituents": "off",
        "typescript/no-floating-promises": "off",
        "typescript/no-for-in-array": "off",
        "typescript/no-implied-eval": "off",
        "typescript/no-misused-promises": "off",
        "typescript/no-redundant-type-constituents": "off",
        "typescript/no-unnecessary-condition": "off",
        "typescript/no-unnecessary-type-assertion": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-enum-comparison": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/no-unsafe-unary-minus": "off",
        "typescript/only-throw-error": "off",
        "typescript/prefer-promise-reject-errors": "off",
        "typescript/require-await": "off",
        "typescript/restrict-plus-operands": "off",
        "typescript/restrict-template-expressions": "off",
        "typescript/unbound-method": "off"
      }
    }
  ]
}
`.raw;

export const oxfmtConfigTemplate = json`
{
  "$schema": "https://raw.githubusercontent.com/oxc-project/oxc/main/npm/oxfmt/configuration_schema.json",
  "printWidth": 80
}
`.raw;
