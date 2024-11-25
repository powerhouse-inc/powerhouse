#! /usr/bin/env node
import {
  generate,
  generateEditor,
  generateFromFile,
  generateProcessor,
} from "./codegen/index";
import {
  parseArgs,
  getConfig,
  promptDirectories,
  parseConfig,
} from "./utils/index";

function parseCommand(argv: string[]) {
  const args = parseArgs(argv, {
    "--editor": String,
    "-e": "--editor",
    "--processor": String,
    "--document-types": String,
  });
  const editorName = args["--editor"];
  const processorName = args["--processor"];

  return {
    processor: !!processorName,
    processorName,
    editor: !!editorName,
    editorName,
    documentTypes: args["--document-types"],
    arg: args._,
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

    await generateProcessor(
      command.processorName,
      command.documentTypes?.split(/[|,;]/g) ?? [],
      config,
    );
  } else if (command.arg.length === 2) {
    await generateFromFile(command.arg[1], config);
  } else {
    await generate(config);
  }
}

main().catch((e: unknown) => {
  throw e;
});
