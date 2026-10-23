import { generateAllApps, generateApp } from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getAppMetadata,
  getEditorMetadata,
} from "@powerhousedao/codegen/utils";
import {
  extractAppDocuments,
  generateAppFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { AppModuleDocument } from "@powerhousedao/vetra/document-models/app-module";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateAppArgs } from "../types.js";
import { resolveModuleDirName } from "../utils/module-dir.js";

const MODULE_FILE_EXPECTATION =
  "an EditorModule with string literals for config.id, config.name and documentTypes";

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
    if (docs.length === 0) {
      console.log("No drive apps found in editors/.");
    }
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  if (all) {
    const { apps, unreadableDirs } = await generateAllApps(project);
    await project.save();
    if (apps.length === 0 && unreadableDirs.length === 0) {
      console.log("No drive apps found in editors/.");
    }
    for (const app of apps) {
      console.log(`Regenerated app "${app.name}" in editors/${app.dirName}`);
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped editors/${dirName}: expected its module.ts to export ${MODULE_FILE_EXPECTATION}. Kept the manifest's apps.`,
      );
    }
    return;
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
    const appMetadata = getAppMetadata(
      project,
      resolveAppDirName(project, projectDir, dir),
    );
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
    await project.save();
    console.log(`Regenerated app "${appName}" in editors/${appDirName}`);
    return;
  } else {
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
}

/** The app directory that `--dir` names, checked to hold a drive app's module.ts */
function resolveAppDirName(
  project: ReturnType<typeof buildTsMorphProject>,
  projectDir: string,
  dir: string,
) {
  const dirName = resolveModuleDirName(projectDir, "editors", dir, "my-app");
  if (!existsSync(join(projectDir, "editors", dirName, "module.ts"))) {
    throw new Error(`editors/${dirName} has no module.ts.`);
  }
  const editorMetadata = getEditorMetadata(project, dirName);
  if (!editorMetadata) {
    throw new Error(
      `Could not read editors/${dirName}/module.ts: expected ${MODULE_FILE_EXPECTATION}.`,
    );
  }
  if (!editorMetadata.documentTypes.includes("powerhouse/document-drive")) {
    throw new Error(
      `editors/${dirName} is a document editor, not a drive app: its documentTypes don't include "powerhouse/document-drive". Use \`ph-cli generate editor --dir ${dirName}\` instead.`,
    );
  }
  return dirName;
}
