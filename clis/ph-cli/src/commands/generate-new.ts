import { binary, command, run, subcommands } from "cmd-ts";

const generateDocumentModelCmd = command({
  name: "document-model",
  aliases: ["doc", "dm"],
  description: "Generate a document model",
  args: {},
  handler: () => {},
});

const generateCmd = subcommands({
  name: "generate",
  cmds: {
    "document-model": generateDocumentModelCmd,
  },
});

const generate = binary(generateCmd);

await run(generate, process.argv);
