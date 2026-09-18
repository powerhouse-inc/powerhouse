import {
  detectFeatures,
  generatePieceTrigger,
  syncFeatureDependencies,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import type { GeneratePieceTriggerArgs } from "../types.js";

export async function startGeneratePieceTrigger(
  args: GeneratePieceTriggerArgs,
  projectDir: string,
) {
  const { namePositional, name: nameOption, piece, strategy, debug } = args;
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
    { pieceDir: piece, triggerName, strategy },
    project,
  );
  await project.save();
  await syncFeatureDependencies(detectFeatures(projectDir), projectDir);
}
