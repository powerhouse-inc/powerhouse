import { defineConfig } from "vitest/config";

// Hold a cluster xid for seconds, stalling every watermark; run alone, last.
const HOLDS_XID = [
  "test/admin/catchup-status-postgres.test.ts",
  "test/catch-up/settled-watermark-postgres.test.ts",
  "test/purge/caches/keyframe-persistence.test.ts",
  "test/purge/e2e/resurrection.test.ts",
  "test/purge/read-models/fence.test.ts",
  "test/purge/review/group-precondition-race.test.ts",
  "test/purge/review/group-race.test.ts",
  "test/purge/review/lock-limit.test.ts",
  "test/read-models/base-read-model/catch-up-postgres.test.ts",
  "test/sync/outbox-transient-gap-postgres.test.ts",
];

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    // PGLite WASM cold boot + 14 migrations in beforeEach can exceed the
    // default 10s hookTimeout on CI runners under coverage instrumentation,
    // especially for NodeFS-backed tests that also copy a data dir per test.
    // 30s still trips on loaded runners (suites boot a fresh PGLite per test),
    // so allow generous headroom; a hung hook still fails, just later.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    alias: {
      "#": new URL("./src/", import.meta.url).pathname,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json"],
      exclude: [
        "test/**",
        "dist/**",
        "**/*.test.ts",
        "**/*.bench.ts",
        "**/*types.ts",
        "**/interfaces.ts",
        "**/index.ts",
        "**/vitest.config.ts",
        "**/run-migrations.ts",
        "**/run-records.ts",
        "**/run-from-vitest.ts",
        "**/run-record-all.ts",
        "**/logging/**",
        "**/migrations/**",
        "**/*-factory.ts",
        "**/*-builder.ts",
        "**/*passthrough*.ts",
        "**/migrator.ts",
        "**/bundle.ts",
        "**/tsdown.config.ts",
      ],
    },
    maxWorkers: 4,
    projects: [
      {
        extends: true,
        test: {
          name: "reactor",
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
          env: { REACTOR_TEST_HOLDS_XID: "1" },
        },
      },
    ],
  },
  plugins: [],
});
