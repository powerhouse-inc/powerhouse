import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Resolve the package's own tsconfig "paths" (e.g. "document-model" ->
    // ./document-model) so tests don't need a workspace dependency on the
    // document-model package, which would create a circular project reference.
    tsconfigPaths: true,
    alias: {
      // `document-model` is a thin re-export of this package's own
      // ./document-model. Alias it to the local source so document-drive tests
      // resolve at runtime without a workspace dependency on the document-model
      // package — that dependency would form a circular project graph (TS6202).
      "document-model": fileURLToPath(
        new URL("./document-model/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    environment: "node",
    // Keep the default run to suites that need no registry or special runtime.
    // The remaining shared tests have their own runners and environment setup.
    include: [
      "clis/command-names.test.ts",
      "clis/file-system/get-config-strict.test.ts",
      "clis/file-system/spawn-async.test.ts",
      "clis/source-config-schema.test.ts",
      "connect/config-loader.test.ts",
      "connect/env-config.test.ts",
      "connect/entrypoint-seed.test.ts",
      "connect/pwa-config.test.ts",
      "connect/pwa-manifest.test.ts",
      "document-drive/**/*.test.ts",
      "document-model/action-transport.test.ts",
      "document-model/mock.test.ts",
      "document-model/signature-transport.test.ts",
      "document-model/utils.test.ts",
      "registry/manifest-slim.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
