import { defineConfig } from "tsdown";

// External: native addons, wasm, and dynamic-require resolvers that break when
// inlined. Everything else is bundled so consumers can bundle switchboard.
const external = [
  /^@electric-sql\/pglite/,
  "pglite-legacy-02",
  "pglite-tools-legacy-02",
  /^pglite-tools/,
  "@powerhousedao/pglite-fs",
  "pg",
  "pg-query-stream",
  "pg-native",
  "better-sqlite3",
  "sqlite3",
  "mysql",
  "mysql2",
  "tedious",
  "oracledb",
  "@pyroscope/nodejs",
  // __dirname-relative asset loads (.conf/.node) that break when bundled.
  "devcert",
  // Bundles framework integrations that eagerly import uninstalled peers
  // (e.g. @fastify/otel); keep external to avoid dragging them in.
  "@sentry/node",
  "@sentry/opentelemetry",
  // Dev/studio-only loader, dynamically imported; not bundled (see server.mts).
  "vite",
  "lightningcss",
  /^@esbuild\//,
  // Studio/codegen/UI trees: huge, dev-only, never on the runtime server path.
  "typescript",
  /^@powerhousedao\/vetra/,
  /^@powerhousedao\/codegen/,
  /^@powerhousedao\/builder-tools/,
  /^@powerhousedao\/design-system/,
  /^@powerhousedao\/common/,
  // Alternate dev gateway/server stack (optional peers in reactor-api).
  "fastify",
  /^@fastify\//,
  "mercurius",
  /^@mercuriusjs\//,
];

export default defineConfig({
  entry: [
    "src/index.mts",
    "src/server.mts",
    "src/utils.mts",
    "src/install-packages.mts",
    "src/migrate.mts",
  ],
  platform: "node",
  outDir: "dist",
  clean: true,
  dts: true,
  sourcemap: true,
  external,
  // Bundle every dependency by default; only `external` stays out.
  noExternal: () => true,
  // Inject __dirname/__filename for bundled CJS deps that reference them.
  shims: true,
});
