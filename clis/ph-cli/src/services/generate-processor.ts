import {
  detectFeatures,
  generateAllProcessors,
  generateProcessor,
  syncFeatureDependencies,
} from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getProcessorMetadata,
} from "@powerhousedao/codegen/utils";
import { dirname } from "node:path";
import type { GenerateProcessorArgs } from "../types.js";

export async function startGenerateProcessor(
  args: GenerateProcessorArgs,
  projectDir: string,
) {
  const {
    name: processorName,
    type: processorType,
    apps: processorApps,
    documentTypes,
    dir,
    all,
    debug,
  } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (all) {
    await generateAllProcessors(project);
  } else if (processorName) {
    await generateProcessor(
      {
        processorName,
        processorApps,
        processorType,
        documentTypes,
      },
      project,
    );
  } else if (dir) {
    const processorDirName = dirname(dir);
    const processorArgs = getProcessorMetadata(project, processorDirName);
    await generateProcessor(processorArgs, project);
  } else {
    console.log("Please specify either `name`, `dir`, or `all`.");
    return;
  }
  await project.save();
  await syncFeatureDependencies(detectFeatures(projectDir), projectDir);
}
