#! /usr/bin/env node
import { getConfig } from "@powerhousedao/config/powerhouse";
import {
  generate,
  generateEditor,
  generateFromFile,
  generateProcessor,
  generateSubgraph,
} from "./codegen/index";
import { parseArgs, parseConfig, promptDirectories } from "./utils/index";

function parseCommand(argv: string[]) {
  const args = parseArgs(argv, {
    "--editor": String,
    "--subgraph": String,
    "-e": "--editor",
    "--processor": String,
    "--document-types": String,
    "--processor-type": String,
    "--file": String,
  });

  const editorName = args["--editor"];
  const processorName = args["--processor"];
  const processorType = args["--processor-type"];
  const subgraphName = args["--subgraph"];
  const file = args["--file"];

  return {
    processor: !!processorName,
    processorName,
    processorType,
    editor: !!editorName,
    editorName,
    documentTypes: args["--document-types"],
    arg: args._,
    subgraph: !!subgraphName,
    subgraphName: subgraphName ?? "example",
    file,
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const baseConfig = getConfig();
  const argsConfig = parseConfig(argv);
  const config = { ...baseConfig, ...argsConfig };
  if (config.interactive) {
    const result = await promptDirectories(config);
    Object.assign(config, result);
  }

  const command = parseCommand(argv);

  if (command.editor) {
    if (!command.editorName) {
      throw new Error("Editor name is required (--editor or -e)");
    }
    await generateEditor(
      command.editorName,
      command.documentTypes?.split(/[|,;]/g) ?? [],
      config,
    );
  } else if (command.processor) {
    if (!command.processorName) {
      throw new Error("processor name is required (--processor)");
    }

    const type = !command.processorType
      ? "analytics"
      : (command.processorType as "analytics" | "operational");

    await generateProcessor(
      command.processorName,
      type,
      command.documentTypes?.split(/[|,;]/g) ?? [],
      config,
    );
  } else if (command.subgraph) {
    if (!command.subgraphName) {
      throw new Error("Subgraph name is required (--subgraph)");
    }
    await generateSubgraph(command.subgraphName, command.file || null, config);
  } else if (command.file || command.arg.length === 2) {
    await generateFromFile(command.file || command.arg[1], config);
  } else {
    await generate(config);
  }
}

main().catch((e: unknown) => {
  throw e;
});
