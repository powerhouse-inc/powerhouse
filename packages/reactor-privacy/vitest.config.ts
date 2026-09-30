import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // One graphql realm: the CommonJS entry Node and @apollo/subgraph load.
    alias: [{ find: /^graphql$/, replacement: require.resolve("graphql") }],
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
