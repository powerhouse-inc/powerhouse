import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["test/**/*.test.ts"],
    globals: true,
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
        "**/*-factory.ts",
        "**/*-builder.ts",
        "**/*passthrough*.ts",
        "**/migrator.ts",
        "**/bundle.ts",
        "**/tsdown.config.ts",
      ],
    },
    maxWorkers: 6,
  },
  plugins: [],
});
