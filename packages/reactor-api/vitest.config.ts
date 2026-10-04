import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const baseExclude = ["**/node_modules/**", "**/dist/**"];
if (process.env.RUN_HUB_SPOKE_INTEGRATION !== "1") {
  baseExclude.push("**/hub-spoke-catchup.integration.test.ts");
}

// Resolve @powerhousedao/reactor through its TypeScript source instead of its
// built `dist/`, the same intent as the `"source"` export condition that
// apps/connect/vitest.config.ts and apps/reactor-monitor/vitest.config.ts opt
// into project-wide.
//
// Without this, the cross-package suites here (fault-injection-sync,
// connect-switchboard-*, hub-spoke and the rest of the reactor integration
// tests) silently test whatever `packages/reactor/dist` happens to hold. That
// masked real behavioural changes for a stretch of feat/multi-reactor: five
// fault-injection-sync assertions kept passing against a stale dist long after
// the contract they asserted had been deliberately replaced in reactor source,
// and only a fresh `pnpm --filter @powerhousedao/reactor build` revealed it.
//
// A targeted alias rather than `resolve.conditions`/`ssr.resolve.conditions`:
// flipping the whole condition set source-first also re-resolves third-party
// CJS (`pg` picks up `pg-pool`'s ESM entry through its own `require`, which
// fails as "Class extends value [object Module]"), and this suite loads the
// Postgres adapters. The alias is exact-match, so reactor's single "."
// export is all it redirects.
const REACTOR_SOURCE = resolve(__dirname, "../reactor/index.ts");

export default defineConfig({
  resolve: {
    alias: {
      "graphql-ws/lib/use/ws": resolve(
        __dirname,
        "../../node_modules/graphql-ws/lib/use/ws.mjs",
      ),
      "@powerhousedao/reactor": REACTOR_SOURCE,
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
