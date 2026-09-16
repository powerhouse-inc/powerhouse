import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve workspace packages through their TypeScript sources, as the rest
    // of the monorepo's suites do.
    conditions: ["source", "import", "module", "default"],
  },
  ssr: {
    resolve: {
      conditions: ["source", "import", "module", "default"],
    },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    globals: true,
    server: {
      deps: {
        // document-model's ./test export ships only as TypeScript source.
        inline: ["document-model"],
      },
    },
  },
});
