import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
    // PGLite WASM cold boot + 14 migrations in beforeEach can exceed the
    // default 10s hookTimeout on CI runners under coverage instrumentation,
    // especially for AtomicNodeFs-backed tests that also do disk snapshot I/O.
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
  },
  plugins: [],
});
