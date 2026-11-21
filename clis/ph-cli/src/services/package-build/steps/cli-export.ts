import { existsSync } from "node:fs";
import { join } from "node:path";
import { markCliExport } from "../../../utils/offered-routes-manifest.js";
import type { StandardBuildStep } from "./context.js";

// After the node build, which writes the Cli to node/cli/index.mjs when the
// package has a cli/index.ts: the dist manifest says the package ships one.
export const cliExportStep: StandardBuildStep = {
  id: "cli-export",
  run: ({ session }) => {
    const stage = session.stage();
    markCliExport(stage, existsSync(join(stage, "node", "cli", "index.mjs")));
    return Promise.resolve();
  },
};
