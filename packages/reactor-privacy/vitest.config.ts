import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";

const require = createRequire(import.meta.url);

// A purge held on its lock keeps a snapshot open, stalling every watermark.
const HOLDS_XID = ["test/erasure-scheduler.test.ts"];

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // One graphql realm: the CommonJS entry Node and @apollo/subgraph load.
    alias: [{ find: /^graphql$/, replacement: require.resolve("graphql") }],
  },
  test: {
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "reactor-privacy",
          include: ["test/**/*.test.ts"],
          exclude: HOLDS_XID,
        },
      },
      {
        extends: true,
        test: {
          name: "holds-xid",
          include: HOLDS_XID,
          maxWorkers: 1,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
