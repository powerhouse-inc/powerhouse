import { subcommands } from "cmd-ts";
import { generateAllCmd } from "./generate-all.js";
import { generateAppCmd } from "./generate-app.js";
import { generateConnectRoutesCmd } from "./generate-connect-routes.js";
import { generateDesktopShellCmd } from "./generate-desktop-shell.js";
import { generateDocumentModelCmd } from "./generate-document-model.js";
import { generateEditorCmd } from "./generate-editor.js";
import { generateHostsCmd } from "./generate-hosts.js";
import { generateMigrationFileCmd } from "./generate-migration-file.js";
import { generatePieceActionCmd } from "./generate-piece-action.js";
import { generatePieceTriggerCmd } from "./generate-piece-trigger.js";
import { generatePieceCmd } from "./generate-piece.js";
import { generateProcessorCmd } from "./generate-processor.js";
import { generateSubgraphCmd } from "./generate-subgraph.js";
import { isUniformRunnersEnabled } from "../utils/feature-flags.js";

const baseGenerateCmds = {
  all: generateAllCmd,
  "document-model": generateDocumentModelCmd,
  editor: generateEditorCmd,
  app: generateAppCmd,
  processor: generateProcessorCmd,
  subgraph: generateSubgraphCmd,
  piece: generatePieceCmd,
  "piece-action": generatePieceActionCmd,
  "piece-trigger": generatePieceTriggerCmd,
  "migration-file": generateMigrationFileCmd,
  "connect-routes": generateConnectRoutesCmd,
  "desktop-shell": generateDesktopShellCmd,
} as const;

/** Exported for tests; `hosts` exists only with uniform runners enabled, so
 * flag-off keeps the command surface unchanged. */
export function buildGenerateCmds(uniformRunners: boolean) {
  return uniformRunners
    ? { ...baseGenerateCmds, hosts: generateHostsCmd }
    : baseGenerateCmds;
}

export const generate = subcommands({
  name: "generate",
  description: `The generate command creates code for Powerhouse modules. It helps you create new code from scratch, or to re-generate existing code in your project.`,
  cmds: buildGenerateCmds(isUniformRunnersEnabled()),
});
