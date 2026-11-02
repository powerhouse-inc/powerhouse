import { defineConfig } from "vitest/config";

const conditions = ["source", "import", "module", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    globals: true,
    include: ["test/**/*.test.ts"],
  },
});
