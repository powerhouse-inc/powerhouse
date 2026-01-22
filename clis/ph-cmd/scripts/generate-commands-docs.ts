import { writeCliDocsMarkdownFile } from "@powerhousedao/codegen/file-builders";
import { init } from "../src/commands/init.js";
import { ph } from "../src/commands/ph.js";
import { setupGlobals } from "../src/commands/setup-globals.js";
import { update } from "../src/commands/update.js";
import { useLocal } from "../src/commands/use-local.js";
import { use } from "../src/commands/use.js";

const commands = [
  { name: "init", command: init },
  { name: "use", command: use },
  { name: "update", command: update },
  { name: "setup-globals", command: setupGlobals },
  { name: "use-local", command: useLocal },
];

const cliDescription = ph.description ?? "";

async function main() {
  await writeCliDocsMarkdownFile({
    filePath: "COMMANDS.md",
    docsTitle: "PH-CMD CLI Commands",
    docsIntroduction:
      "This document provides detailed information about the available commands in the PH-CMD CLI. The CLI is published as `ph-cmd` and is invoked with the `ph` command.",
    cliDescription,
    entries: commands,
  });
  return;
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
