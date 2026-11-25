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
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateProcessorArgs } from "../types.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";
import { resolveModuleDirName } from "../utils/module-dir.js";

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
  const report: string[] = [];
  if (all) {
    const processors = await generateAllProcessors(project);
    if (processors.length === 0) {
      report.push("No processors found in processors/.");
    }
    for (const { processorName } of processors) {
      report.push(`Regenerated processor in processors/${processorName}`);
    }
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
    const processorDirName = resolveModuleDirName(
      projectDir,
      "processors",
      dir,
      "my-processor",
    );
    const processorDir = join(projectDir, "processors", processorDirName);
    if (
      !["processor.ts", "index.ts"].some((file) =>
        existsSync(join(processorDir, file)),
      )
    ) {
      throw new Error(
        `processors/${processorDirName} has no processor.ts or index.ts.`,
      );
    }
    const processorArgs = getProcessorMetadata(project, processorDirName);
    await generateProcessor(processorArgs, project);
    report.push(`Regenerated processor in processors/${processorDirName}`);
  } else {
    console.log("Please specify one of `name`, `dir`, or `all`.");
    return;
  }
  await project.save();
  for (const line of report) {
    console.log(line);
  }
  const added = await syncFeatureDependencies(
    detectFeatures(projectDir),
    projectDir,
  );
  await installAddedDependencies(added, projectDir, args.skipInstall);
}
