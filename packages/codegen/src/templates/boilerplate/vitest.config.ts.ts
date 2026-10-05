import { ts } from "@tmpl/core";

export const vitestConfigTemplate = ts`
import { configDefaults, defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  test: {
    globals: true,
    // \`ph build\` stages a compiled copy of the package, tests included,
    // under \`.ph/build\`, where its bare imports do not resolve.
    exclude: [...configDefaults.exclude, ".ph/**"],
    coverage: {
      provider: "v8",
      include: ["document-models/**/src/reducers/**"],
      thresholds: {
        lines: 95,
        branches: 95,
        functions: 95,
        statements: 95,
      },
    },
  },
  plugins: [tsconfigPaths()],
});

`.raw;
