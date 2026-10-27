import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const packages = resolve(import.meta.dirname, "../../packages");

/**
 * The reactor, reactor-api and reactor-drive are read from source, so a test
 * never runs the switchboard's wiring against a stale dist of the packages it
 * wires (the client halves live in their source first). Only these: the
 * "source" condition for every package breaks those whose source leans on
 * their own build.
 */
const SOURCE_ALIASES: Record<string, string> = {
  "@powerhousedao/reactor": "reactor/index.ts",
  "@powerhousedao/reactor/rpc": "reactor/src/rpc/index.ts",
  "@powerhousedao/reactor-api": "reactor-api/index.mts",
  "@powerhousedao/reactor-api/vite": "reactor-api/src/packages/vite-loader.mts",
  "@powerhousedao/reactor-api/https-hooks":
    "reactor-api/src/packages/https-hooks.mts",
  "@powerhousedao/reactor-api/pglite-node":
    "reactor-api/src/pglite/pglite-node.ts",
  "@powerhousedao/reactor-api/subgraph-types":
    "reactor-api/src/graphql/subgraph-types.ts",
  "@powerhousedao/reactor-drive": "reactor-drive/index.ts",
  "@powerhousedao/reactor-drive/subgraph":
    "reactor-drive/src/subgraph/index.ts",
};

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export default defineConfig({
  resolve: {
    alias: Object.entries(SOURCE_ALIASES).map(([name, path]) => ({
      find: new RegExp(`^${escape(name)}$`),
      replacement: resolve(packages, path),
    })),
  },
  plugins: [
    {
      // reactor-api's source imports its GraphQL schema files as strings.
      name: "graphql-source-loader",
      resolveId(source, importer) {
        if (source.endsWith(".graphql")) {
          return resolve(dirname(importer || ""), source);
        }
        return null;
      },
      load(id) {
        if (id.endsWith(".graphql")) {
          return `export default ${JSON.stringify(readFileSync(id, "utf-8"))}`;
        }
        return null;
      },
    },
  ],
  test: {
    pool: "forks",
    environment: "node",
    isolate: true,
    maxWorkers: 1,
    // Node 24's V8 double-frees tiered wasm wrappers after a PGlite worker exits (nodejs/node#66366).
    execArgv: ["--wasm-wrapper-tiering-budget=1000000000"],
    include: ["test/**/*.test.ts"],
  },
});
