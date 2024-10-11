#! /usr/bin/env node
import { generate, generateEditor, generateFromFile } from "./codegen/index";
import { parseArgs, getConfig, promptDirectories, parseConfig } from "./utils";

async function parseCommand(argv: string[]) {
  const args = parseArgs(argv, {
    "--editor": String,
    "-e": "--editor",
    "--document-types": String,
  });
  const editorName = args["--editor"];
  return {
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

  const command = await parseCommand(argv);
  if (command.editor) {
    await generateEditor(
      command.editorName!,
      command.documentTypes?.split(/[|,;]/g) ?? [],
      config,
    );
  } else if (command.arg.length === 2) {
    await generateFromFile(command.arg[1], config);
  } else {
    await generate(config);
  }
}

main();
