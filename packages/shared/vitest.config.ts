import { fileURLToPath } from "node:url";
import { defineProject } from "vitest/config";

const resolvePath = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineProject({
  resolve: {
    // Resolve workspace packages to their TS source; document-model and the
    // `types` path alias aren't symlinked into this package's node_modules.
    conditions: ["source"],
    alias: {
      "document-model": resolvePath("./document-model/index.ts"),
      types: resolvePath("./types/index.ts"),
    },
  },
  test: {
    globals: true,
    include: ["document-drive/src/tests/**/*.test.ts"],
  },
});
