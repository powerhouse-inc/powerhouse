import { defineConfig } from "vitest/config";

// Workspace packages resolve to their sources, so no stale dist is read.
const conditions = ["source", "import", "module", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: { include: ["test/**/*.test.ts"] },
});
