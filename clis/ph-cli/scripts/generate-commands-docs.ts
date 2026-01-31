import { writeCliDocsMarkdownFile } from "@powerhousedao/codegen/file-builders";
import { accessToken } from "../src/commands/access-token.js";
import { build, connect, preview, studio } from "../src/commands/connect.js";
import { generate } from "../src/commands/generate.js";
import { inspect } from "../src/commands/inspect.js";
import { install } from "../src/commands/install.js";
import { list } from "../src/commands/list.js";
import { login } from "../src/commands/login.js";
import { migrate } from "../src/commands/migrate.js";
import { phCli } from "../src/commands/ph-cli.js";
import { switchboard } from "../src/commands/switchboard.js";
import { uninstall } from "../src/commands/uninstall.js";
import { vetra } from "../src/commands/vetra.js";

const commands = [
  { name: "generate", command: generate },
  { name: "vetra", command: vetra },
  { name: "connect", command: connect },
  { name: "connect studio", command: studio },
  { name: "connect build", command: build },
  { name: "connect preview", command: preview },
  { name: "access token", command: accessToken },
  { name: "inspect", command: inspect },
  { name: "list", command: list },
  { name: "migrate", command: migrate },
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
