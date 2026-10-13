import { defineConfig } from "vitest/config";

const conditions = ["source", "import", "module", "browser", "default"];

export default defineConfig({
  resolve: { conditions },
  ssr: { resolve: { conditions } },
  test: {
    globals: true,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
  },
});
