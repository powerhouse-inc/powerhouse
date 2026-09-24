import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Workspace packages resolve through their TypeScript sources, so the suites
// run without any sibling dist/ having been built first.
const conditions = ["source", "import", "module", "default"];

export default defineConfig({
  resolve: {
    conditions,
    // @powerhousedao/shared's sources import document-model without declaring
    // it — the two are circular — so nothing resolves it from there.
    alias: [
      {
        find: /^document-model$/,
        replacement: fileURLToPath(
          new URL("../document-model/index.ts", import.meta.url),
        ),
      },
    ],
  },
  ssr: { resolve: { conditions } },
  test: {
    // Includes test/upstream, generated from Activepieces' engine suites.
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    // Upstream's suites rely on the globals.
    globals: true,
    setupFiles: ["test/setup.ts"],
    // PGlite's cold boot and a forked piece worker both outrun the default 5s.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    server: {
      deps: {
        // document-model's sources reach parts of the tree node refuses to
        // resolve once the package is externalized.
        inline: ["document-model"],
      },
    },
  },
});
