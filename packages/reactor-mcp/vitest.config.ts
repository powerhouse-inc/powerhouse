import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["source", "import", "module", "default"],
    alias: {
      // shared cannot depend on document-model without a workspace cycle.
      "document-model": fileURLToPath(
        new URL("../document-model/index.ts", import.meta.url),
      ),
    },
  },
  ssr: {
    resolve: {
      conditions: ["source", "import", "module", "default"],
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
