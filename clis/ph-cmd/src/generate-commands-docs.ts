import { writeCliDocsMarkdownFile } from "@powerhousedao/codegen/file-builders";
import { init } from "./commands/init.js";
import { ph } from "./commands/ph.js";
import { setupGlobals } from "./commands/setup-globals.js";
import { update } from "./commands/update.js";
import { useLocal } from "./commands/use-local.js";
import { use } from "./commands/use.js";

const commands = [
  { name: "init", command: init },
  { name: "use", command: use },
  { name: "update", command: update },
  { name: "setup-globals", command: setupGlobals },
  { name: "use-local", command: useLocal },
];

const cliDescription = ph.description ?? "";
declare const CLI_VERSION: string;

async function main() {
  await writeCliDocsMarkdownFile({
    filePath: "COMMANDS.md",
    docsTitle: `PH-CMD CLI Commands (${CLI_VERSION})`,
    docsIntroduction:
      "This document provides detailed information about the available commands in the PH-CMD CLI. The CLI is published as `ph-cmd` and is invoked with the `ph` command.",
    cliDescription,
    entries: commands,
  });
  process.exit(0);
}

await main();
