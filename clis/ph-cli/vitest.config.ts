import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const phRun = (file: string) =>
  fileURLToPath(new URL(`../ph-run/src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Its source rather than its build, so a test can mock what it's made of.
    alias: {
      "@powerhousedao/ph-run/service-args": phRun("services/service-args.ts"),
      "@powerhousedao/ph-run/connect-serve": phRun("services/connect-serve.ts"),
      "@powerhousedao/ph-run/connect-server": phRun(
        "services/connect-server.ts",
      ),
      "@powerhousedao/ph-run/local-sign-in": phRun("services/local-sign-in.ts"),
      "@powerhousedao/ph-run/member-config": phRun("runners/member-config.ts"),
      "@powerhousedao/ph-run/runners/connect": phRun("runners/connect.ts"),
      "@powerhousedao/ph-run/runners/switchboard": phRun(
        "runners/switchboard.ts",
      ),
      "@powerhousedao/ph-run/start-run": phRun("services/run/start-run.ts"),
      "@powerhousedao/ph-run/switchboard": phRun("services/switchboard.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    // Never the user's own login: commands that reach it (publish) make one.
    env: {
      PH_IDENTITY_HOME: path.join(os.tmpdir(), "ph-cli-test-identities"),
    },
    // A file's first test pays for loading the runners, which takes longer
    // than the default on Windows.
    testTimeout: process.platform === "win32" ? 20_000 : 5_000,
  },
});
