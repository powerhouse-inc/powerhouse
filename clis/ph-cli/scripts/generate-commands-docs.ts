import { writeCliDocsMarkdownFile } from "@powerhousedao/codegen/file-builders";
import { accessToken } from "../src/commands/access-token.js";
import { build as buildCmd } from "../src/commands/build.js";
import { build, connect, preview, studio } from "../src/commands/connect.js";
import { generateAllCmd } from "../src/commands/generate-all.js";
import { generateAppCmd } from "../src/commands/generate-app.js";
import { generateDocumentModelCmd } from "../src/commands/generate-document-model.js";
import { generateEditorCmd } from "../src/commands/generate-editor.js";
import { generateMigrationFileCmd } from "../src/commands/generate-migration-file.js";
import { generatePieceActionCmd } from "../src/commands/generate-piece-action.js";
import { generatePieceTriggerCmd } from "../src/commands/generate-piece-trigger.js";
import { generatePieceCmd } from "../src/commands/generate-piece.js";
import { generateProcessorCmd } from "../src/commands/generate-processor.js";
import { generateSubgraphCmd } from "../src/commands/generate-subgraph.js";
import { generate } from "../src/commands/generate.js";
import { inspect } from "../src/commands/inspect.js";
import { install } from "../src/commands/install.js";
import { list } from "../src/commands/list.js";
import { login } from "../src/commands/login.js";
import { migrate } from "../src/commands/migrate.js";
import {
  model,
  modelCheck,
  modelInspect,
  modelPrepack,
} from "../src/commands/model.js";
import { phCli } from "../src/commands/ph-cli.js";
import { publish } from "../src/commands/publish.js";
import { scalar, scalarInspect } from "../src/commands/scalar.js";
import { subgraphInspect } from "../src/commands/subgraph.js";
import { switchboard } from "../src/commands/switchboard.js";
import { uninstall } from "../src/commands/uninstall.js";
import { vetra } from "../src/commands/vetra.js";

const commands = [
  { name: "generate", command: generate },
  { name: "all", command: generateAllCmd },
  { name: "document-model", command: generateDocumentModelCmd },
  { name: "editor", command: generateEditorCmd },
  { name: "app", command: generateAppCmd },
  { name: "processor", command: generateProcessorCmd },
  { name: "subgraph", command: generateSubgraphCmd },
  { name: "piece", command: generatePieceCmd },
  { name: "piece-action", command: generatePieceActionCmd },
  { name: "piece-trigger", command: generatePieceTriggerCmd },
  { name: "migration-file", command: generateMigrationFileCmd },
  { name: "vetra", command: vetra },
  { name: "build", command: buildCmd },
  { name: "connect", command: connect },
  { name: "connect studio", command: studio },
  { name: "connect build", command: build },
  { name: "connect preview", command: preview },
  { name: "build", command: buildCmd },
  { name: "publish", command: publish },
  { name: "access token", command: accessToken },
  { name: "inspect", command: inspect },
  { name: "list", command: list },
  { name: "migrate", command: migrate },
  { name: "model", command: model },
  { name: "model check", command: modelCheck },
  { name: "model inspect", command: modelInspect },
  { name: "model prepack", command: modelPrepack },
  { name: "subgraph inspect", command: subgraphInspect },
  { name: "scalar", command: scalar },
  { name: "scalar inspect", command: scalarInspect },
  { name: "switchboard", command: switchboard },
  { name: "login", command: login },
  { name: "install", command: install },
  { name: "uninstall", command: uninstall },
];

const cliDescription = phCli.description ?? "";

async function main() {
  await writeCliDocsMarkdownFile({
    filePath: "COMMANDS.md",
    docsTitle: `Powerhouse CLI Commands (${process.env.WORKSPACE_VERSION || process.env.npm_package_version})`,
    docsIntroduction:
      "This document provides detailed information about the available commands in the Powerhouse CLI.",
    cliDescription,
    entries: commands,
  });
}

await main();
