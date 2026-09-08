import { defineConfig } from "vitest/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    conditions: ["source", "import", "module", "default"],
    alias: [
      {
        find: /^@powerhousedao\/shared\/clis\/config-strict$/,
        replacement: resolve(
          packageRoot,
          "../../packages/shared/clis/file-system/get-config-strict.ts",
        ),
      },
      {
        find: /^document-model\/tooling$/,
        replacement: resolve(
          packageRoot,
          "../../packages/document-model/tooling.ts",
        ),
      },
      {
        find: /^document-model$/,
        replacement: resolve(
          packageRoot,
          "../../packages/document-model/index.ts",
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
