import { type Command } from "commander";
import { generateHelp } from "../help.js";
import { type GenerateOptions } from "../services/generate.js";
import { type CommandActionType } from "../types.js";
import { setCustomHelp } from "../utils.js";

async function startGenerate(
  filePath: string | undefined,
  options: GenerateOptions,
) {
  const Generate = await import("../services/generate.js");
  const { startGenerate } = Generate;
  return startGenerate(filePath, options);
}

export const generate: CommandActionType<
  [string | undefined, GenerateOptions]
> = async (filePath, options) => {
  return startGenerate(filePath, options);
};

export function generateCommand(program: Command) {
  const cmd = program
    .command("generate")
    .description("Generate code from the document models")
    .argument("[document-model-file]", "Path to the document model file")
    .option("-i, --interactive", "Run the command in interactive mode")
    .option("--editors <type>", "Path to the editors directory")
    .option("-e, --editor <type>", "Editor Name")
    .option("--file <path>", "File path to document model")
    .option("--processors <type>", "Path to the processors directory")
    .option("-p, --processor <type>", "Processor Name")
    .option("--processor-type <type>", "Processor Type")
    .option("-s, --subgraph <type>", "Subgraph Name")
    .option("--document-models <type>", "Path to the document models directory")
    .option("--document-types <type>", "Supported document types by the editor")
    .option("-is, --import-script <type>", "Import Script Name")
    .option("-sf, --skip-format", "Skip formatting the generated code")
    .option("-w, --watch", "Watch the generated code")
    .option(
      "-d, --drive-editor <name>",
      "Generate a drive editor with the specified name",
    );

  // Use the setCustomHelp utility to apply custom help formatting
  setCustomHelp(cmd, generateHelp);

  cmd.action(generate);
}
