import os from "node:os";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Never the user's own supervisor: a host service would start under it.
    env: {
      PH_SUPERVISOR_HOME: path.join(os.tmpdir(), "ph-clint-test-no-supervisor"),
    },
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    // NOTE(port): several ported suites (TUI raw-mode, service children) leave
    // handles open that keep a worker THREAD alive after all tests pass — the
    // run then never exits (hangs CI). Forked workers can be reaped.
    pool: "forks",
    teardownTimeout: 15_000,
    // sweeps fixture children orphaned by killed workers (see the file)
    globalSetup: ["./test/global-teardown.ts"],
  },
});
