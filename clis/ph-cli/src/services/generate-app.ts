import { generateAllApps, generateApp } from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getAppMetadata,
} from "@powerhousedao/codegen/utils";
import {
  extractAppDocuments,
  generateAppFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { AppModuleDocument } from "@powerhousedao/vetra/document-models/app-module";
import { dirname } from "node:path";
import type { GenerateAppArgs } from "../types.js";

export async function startGenerateApp(
  args: GenerateAppArgs,
  projectDir: string,
) {
  const {
    name,
    allowedDocumentTypes = [],
    disableDragAndDrop,
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
    const docs = extractAppDocuments(project);
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  if (all) {
    await generateAllApps(project);
  } else if (document) {
    const doc = (await getDocument(document)) as AppModuleDocument;
    await generateAppFromDocument(doc, project);
  } else if (name) {
    await generateApp(
      {
        appName: name,
        allowedDocumentTypes,
        isDragAndDropEnabled: !disableDragAndDrop,
      },
      project,
    );
  } else if (dir) {
    const appMetadata = getAppMetadata(project, dirname(dir));
    if (!appMetadata) {
      throw new Error(`Failed to get data for app in dir "${dir}"`);
    }
    const {
      name: appName,
      id: appId,
      dirName: appDirName,
      allowedDocumentTypes,
      isDragAndDropEnabled,
    } = appMetadata;

    await generateApp(
      {
        appName,
        appId,
        appDirName,
        allowedDocumentTypes,
        isDragAndDropEnabled,
      },
      project,
    );
  } else {
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
}
