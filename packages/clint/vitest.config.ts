import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // NOTE(port): several ported suites (TUI raw-mode, service children) leave
    // handles open that keep a worker THREAD alive after all tests pass — the
    // run then never exits (hangs CI). Forked workers can be reaped.
    pool: "forks",
    teardownTimeout: 15_000,
  },
});
