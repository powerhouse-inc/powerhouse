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
import {
  extractProcessorDocuments,
  generateProcessorFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { ProcessorModuleDocument } from "@powerhousedao/vetra/document-models/processor-module";
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
    document,
    dir,
    all,
    extract,
    debug,
  } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (extract) {
    const docs = extractProcessorDocuments(project);
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  if (all) {
    await generateAllProcessors(project);
  } else if (document) {
    const doc = (await getDocument(document)) as ProcessorModuleDocument;
    await generateProcessorFromDocument(doc, project);
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
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
  await syncFeatureDependencies(detectFeatures(projectDir), projectDir);
}
