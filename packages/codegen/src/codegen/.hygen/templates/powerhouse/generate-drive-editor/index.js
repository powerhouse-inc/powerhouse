const { pascalCase, paramCase } = require("change-case");
const { getModuleExports } = require("../utils.js");

// @ts-check
module.exports = {
  params: ({ args }) => {
    const name = args.name;
    const rootDir = args.rootDir;
    const pascalCaseDriveEditorName = pascalCase(name);
    const paramCaseDriveEditorName = paramCase(name);
    const moduleExports = getModuleExports(
      rootDir,
      /export\s+const\s+(\w+)\s*:\s*EditorModule\s*=/,
      {
        paramCaseName: paramCaseDriveEditorName,
        pascalCaseName: pascalCaseDriveEditorName,
      }
    );
    return {
      rootDir,
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
