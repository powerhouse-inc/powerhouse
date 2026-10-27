import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const baseExclude = ["**/node_modules/**", "**/dist/**"];
if (process.env.RUN_HUB_SPOKE_INTEGRATION !== "1") {
  baseExclude.push("**/hub-spoke-catchup.integration.test.ts");
}

// The reactor is read from source, so a test never runs against a stale dist
// of the client halves this package is wired to. Only the reactor: resolving
// every package through its "source" condition breaks packages whose source
// leans on their own build.
const REACTOR_SOURCE = resolve(import.meta.dirname, "../reactor");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@powerhousedao\/reactor$/,
        replacement: resolve(REACTOR_SOURCE, "index.ts"),
      },
      {
        find: /^@powerhousedao\/reactor\/rpc$/,
        replacement: resolve(REACTOR_SOURCE, "src/rpc/index.ts"),
      },
    ],
  },
  test: {
    exclude: baseExclude,
    // Node 24's V8 double-frees tiered wasm wrappers after a PGlite worker exits (nodejs/node#66366).
    execArgv: ["--wasm-wrapper-tiering-budget=1000000000"],
    // PGLite WASM cold boot plus initdb's fsync pass can exceed the default
    // 5s testTimeout / 10s hookTimeout on CI runners under coverage
    // instrumentation. Same rationale as packages/reactor.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    deps: {
      optimizer: {
        web: {
          include: ["graphql-ws"],
        },
      },
    },
  },
  plugins: [
    {
      name: "graphql-path-resolver",
      resolveId(source, importer) {
        if (source.endsWith(".graphql")) {
          return resolve(dirname(importer || ""), source);
        }
        return null;
      },
      load(id) {
        if (id.endsWith(".graphql")) {
          const content = readFileSync(id, "utf-8");
          return `export default ${JSON.stringify(content)}`;
        }
        return null;
      },
    },
  ],
});
