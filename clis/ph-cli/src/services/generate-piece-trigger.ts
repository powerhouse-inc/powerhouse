import {
  detectFeatures,
  generatePieceTrigger,
  syncFeatureDependencies,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type { GeneratePieceTriggerArgs } from "../types.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";

export async function startGeneratePieceTrigger(
  args: GeneratePieceTriggerArgs,
  projectDir: string,
) {
  const {
    namePositional,
    name: nameOption,
    piece,
    strategy,
    requireReactor,
    debug,
  } = args;
  if (debug) {
    console.log({ args });
  }
  const triggerName = namePositional ?? nameOption;
  if (!triggerName) {
    console.log("Please specify the name of the trigger to generate.");
    return;
  }
  const project = buildTsMorphProject(projectDir);
  await generatePieceTrigger(
    { pieceDir: piece, triggerName, strategy, requireReactor },
    project,
  );
  await project.save();
  const added = await syncFeatureDependencies(
    detectFeatures(projectDir),
    projectDir,
  );
  await installAddedDependencies(added, projectDir, args.skipInstall);
}
