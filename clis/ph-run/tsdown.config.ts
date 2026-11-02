import { defineConfig } from "tsdown";
import { dtsExportList } from "../../tsdown.dts.mjs";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    // Host files name these as runner.module, and a packaged app's host files
    // are rewritten to them: it has this package and not ph-cli.
    "runners/connect": "src/runners/connect.ts",
    "runners/switchboard": "src/runners/switchboard.ts",
    // What ph-cli builds its other verbs and commands on.
    "runners/member-config": "src/runners/member-config.ts",
    "services/classic-args": "src/services/classic-args.ts",
    "services/connect-serve": "src/services/connect-serve.ts",
    "services/connect-server": "src/services/connect-server.ts",
    "services/run/start-run": "src/services/run/start-run.ts",
    "services/switchboard": "src/services/switchboard.ts",
  },
  outDir: "dist",
  clean: true,
  dts: { generator: "tsgo" },
  plugins: [dtsExportList()],
  sourcemap: true,
});
