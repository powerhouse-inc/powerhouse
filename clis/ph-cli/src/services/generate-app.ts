import { generateAllApps, generateApp } from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getAppMetadata,
} from "@powerhousedao/codegen/utils";
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
    dir,
    all,
    debug,
  } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (all) {
    await generateAllApps(project);
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
    console.log("Please specify either `name`, `dir`, or `all`.");
  }
}
