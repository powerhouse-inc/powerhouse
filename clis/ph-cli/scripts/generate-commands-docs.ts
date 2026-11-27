import { writeCliDocsMarkdownFile } from "@powerhousedao/codegen/file-builders";
import { accessToken } from "../src/commands/access-token.js";
import { build as buildCmd } from "../src/commands/build.js";
import { config as connectConfig, connect } from "../src/commands/connect.js";
import { generateAllCmd } from "../src/commands/generate-all.js";
import { generateAppCmd } from "../src/commands/generate-app.js";
import { generateConnectRoutesCmd } from "../src/commands/generate-connect-routes.js";
import { generateDocumentModelCmd } from "../src/commands/generate-document-model.js";
import { generateEditorCmd } from "../src/commands/generate-editor.js";
import { generateHostsCmd } from "../src/commands/generate-hosts.js";
import { generateMigrationFileCmd } from "../src/commands/generate-migration-file.js";
import { generatePieceActionCmd } from "../src/commands/generate-piece-action.js";
import { generatePieceTriggerCmd } from "../src/commands/generate-piece-trigger.js";
import { generatePieceCmd } from "../src/commands/generate-piece.js";
import { generateProcessorCmd } from "../src/commands/generate-processor.js";
import { generateSubgraphCmd } from "../src/commands/generate-subgraph.js";
import { generate } from "../src/commands/generate.js";
import {
  check as hostCheck,
  exportCmd as hostExport,
} from "../src/commands/host.js";
import { inspect } from "../src/commands/inspect.js";
import { install } from "../src/commands/install.js";
import { keyframes } from "../src/commands/keyframes.js";
import { list } from "../src/commands/list.js";
import {
  credentialsList,
  credentialsWithdraw,
} from "../src/commands/credentials.js";
import { identityNew, identityPassword } from "../src/commands/identity.js";
import { login } from "../src/commands/login.js";
import { logout } from "../src/commands/logout.js";
import { mcp } from "../src/commands/mcp.js";
import { migrate } from "../src/commands/migrate.js";
import { modelCheck, modelInspect } from "../src/commands/model.js";
import { phCli } from "../src/commands/ph-cli.js";
import { runHost } from "../src/commands/run.js";
import {
  tokenApprove,
  tokenCreate,
  tokenList,
  tokenWithdraw,
} from "../src/commands/token.js";
import { uninstall } from "../src/commands/uninstall.js";
import { vetra } from "../src/commands/vetra.js";
import { whoami } from "../src/commands/whoami.js";

const commands = [
  { name: "run", command: runHost },
  { name: "host check", command: hostCheck },
  { name: "host export", command: hostExport },
  { name: "vetra", command: vetra },
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
  { name: "connect-routes", command: generateConnectRoutesCmd },
  { name: "hosts", command: generateHostsCmd },
  { name: "build", command: buildCmd },
  { name: "connect", command: connect },
  { name: "connect config", command: connectConfig },
  { name: "access token", command: accessToken },
  { name: "inspect", command: inspect },
  { name: "keyframes", command: keyframes },
  { name: "list", command: list },
  { name: "mcp", command: mcp },
  { name: "migrate", command: migrate },
  { name: "model check", command: modelCheck },
  { name: "model inspect", command: modelInspect },
  { name: "login", command: login },
  { name: "whoami", command: whoami },
  { name: "logout", command: logout },
  { name: "identity password", command: identityPassword },
  { name: "identity new", command: identityNew },
  { name: "credentials list", command: credentialsList },
  { name: "credentials withdraw", command: credentialsWithdraw },
  { name: "token create", command: tokenCreate },
  { name: "token approve", command: tokenApprove },
  { name: "token list", command: tokenList },
  { name: "token withdraw", command: tokenWithdraw },
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
