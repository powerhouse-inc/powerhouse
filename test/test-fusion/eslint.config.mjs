import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      // Stated rather than detected. eslint-config-next leaves this as
      // "detect", and detection reads the linted file's path through an API
      // ESLint 10 removed, so eslint-plugin-react throws while loading its
      // rules. This package pins ESLint 9 for eslint-config-next, so its own
      // `pnpm lint` never hit that - but the repo-root lint-staged hook runs
      // ESLint 10, which made every commit touching this package fail.
      react: { version: "19.2" },
    },
    rules: {
      // This app is app-router only, so the rule has no pages directory to
      // check against. It looks for one relative to the working directory, so
      // a run from the repo root prints a "Pages directory cannot be found"
      // notice naming the root rather than this package.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
