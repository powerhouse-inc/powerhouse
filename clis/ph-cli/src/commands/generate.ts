import { subcommands } from "cmd-ts";
import { generateAllCmd } from "./generate-all.js";
import { generateAppCmd } from "./generate-app.js";
import { generateDocumentModelCmd } from "./generate-document-model.js";
import { generateEditorCmd } from "./generate-editor.js";
import { generateMigrationFileCmd } from "./generate-migration-file.js";
import { generateProcessorCmd } from "./generate-processor.js";
import { generateSubgraphCmd } from "./generate-subgraph.js";

export const generate = subcommands({
  name: "generate",
  description: `The generate command creates code from document models. It helps you build editors, processors, and other components based on your document model files.`,
  cmds: {
    all: generateAllCmd,
    "document-model": generateDocumentModelCmd,
    editor: generateEditorCmd,
    app: generateAppCmd,
    processor: generateProcessorCmd,
    subgraph: generateSubgraphCmd,
    "migration-file": generateMigrationFileCmd,
  },
});
