import { type Command } from "commander";
import { type GenerateOptions } from "../services/generate.js";
import { type CommandActionType } from "../types.js";

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
  program
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
    .action(generate);
}
