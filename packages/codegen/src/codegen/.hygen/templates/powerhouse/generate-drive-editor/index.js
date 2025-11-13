const { pascalCase, paramCase } = require("change-case");
const { getModuleExports } = require("../utils.js");
const path = require("path");

// @ts-check
module.exports = {
  params: ({ args }) => {
    const name = args.name;
    const rootDir = args.rootDir;
    const driveEditorDirName = args.driveEditorDirName || paramCase(args.name);
    const driveEditorDir = path.join(rootDir, driveEditorDirName);
    const pascalCaseDriveEditorName = pascalCase(name);
    const paramCaseDriveEditorName = paramCase(name);
    const moduleExports = getModuleExports(
      rootDir,
      /export\s+const\s+(\w+)\s*:\s*EditorModule\s*=/,
      {
        paramCaseName: driveEditorDirName,
        pascalCaseName: pascalCaseDriveEditorName,
      },
    );

    return {
      rootDir,
      driveEditorDir,
      moduleExports,
      name: args.name,
      appId: args.appId,
      isDragAndDropEnabled: args.isDragAndDropEnabled,
      allowedDocumentTypes: args.allowedDocumentTypes,
      pascalCaseDriveEditorName,
      paramCaseDriveEditorName,
    };
  },
};
