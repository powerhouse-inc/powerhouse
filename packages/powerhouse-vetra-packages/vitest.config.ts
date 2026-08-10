import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // The "document-model/test" subpath only ships as source (no dist build),
  // so it cannot resolve through package exports here; point straight at it.
  resolve: {
    alias: {
      "document-model/test": fileURLToPath(
        new URL("../document-model/test/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    include: ["editors/**/*.test.ts", "document-models/**/*.test.ts"],
    exclude: ["**/helpers.test.ts"],
    globals: true,
  },
});
