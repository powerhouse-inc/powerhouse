import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const phRun = (file: string) =>
  fileURLToPath(new URL(`../ph-run/src/${file}`, import.meta.url));

export default defineConfig({
  resolve: {
    // Its source rather than its build, so a test can mock what it's made of.
    alias: {
      "@powerhousedao/ph-run/classic-args": phRun("services/classic-args.ts"),
      "@powerhousedao/ph-run/connect-serve": phRun("services/connect-serve.ts"),
      "@powerhousedao/ph-run/connect-server": phRun(
        "services/connect-server.ts",
      ),
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
  },
});
