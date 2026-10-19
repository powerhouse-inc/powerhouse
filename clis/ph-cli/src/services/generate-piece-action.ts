import {
  generatePieceAction,
  installFeatureDependencies,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type { GeneratePieceActionArgs } from "../types.js";

export async function startGeneratePieceAction(
  args: GeneratePieceActionArgs,
  projectDir: string,
) {
  const {
    namePositional,
    name: nameOption,
    piece,
    requireReactor,
    debug,
  } = args;
  if (debug) {
    console.log({ args });
  }
  const actionName = namePositional ?? nameOption;
  if (!actionName) {
    console.log("Please specify the name of the action to generate.");
    return;
  }
  const project = buildTsMorphProject(projectDir);
  await generatePieceAction(
    { pieceDir: piece, actionName, requireReactor },
    project,
  );
  await project.save();
  await installFeatureDependencies(projectDir, {
    skipInstall: args.skipInstall,
  });
}
