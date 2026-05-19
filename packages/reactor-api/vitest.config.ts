import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const baseExclude = ["**/node_modules/**", "**/dist/**"];
if (process.env.RUN_HUB_SPOKE_INTEGRATION !== "1") {
  baseExclude.push("**/hub-spoke-catchup.integration.test.ts");
}

export default defineConfig({
  resolve: {
    alias: {
      "graphql-ws/lib/use/ws": resolve(
        __dirname,
        "../../node_modules/graphql-ws/lib/use/ws.mjs",
      ),
    },
  },
  test: {
    exclude: baseExclude,
    // PGLite WASM cold boot plus AtomicNodeFs snapshot I/O can exceed the
    // default 5s testTimeout / 10s hookTimeout on CI runners under coverage
    // instrumentation. Same rationale as packages/reactor and packages/pglite-fs.
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
