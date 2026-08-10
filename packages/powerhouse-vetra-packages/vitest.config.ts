import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Use the "source" export condition so workspace packages (e.g.
    // document-model/test) resolve via their TypeScript sources rather
    // than requiring their dist/ to exist first.
    conditions: ["source", "import", "module", "default"],
  },
  ssr: {
    resolve: {
      conditions: ["source", "import", "module", "default"],
    },
  },
  test: {
    include: ["editors/**/*.test.ts", "document-models/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "**/helpers.test.ts"],
    globals: true,
    server: {
      deps: {
        // document-model's ./test export only exists as TypeScript source
        // (its build emits no dist/test), so Node resolution fails when the
        // package is externalized. Inline it so Vite resolves it via the
        // "source" condition above.
        inline: ["document-model"],
      },
    },
  },
});
