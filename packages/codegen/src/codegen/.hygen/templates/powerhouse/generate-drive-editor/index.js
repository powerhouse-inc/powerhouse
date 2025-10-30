const { pascalCase, paramCase } = require("change-case");

// @ts-check
module.exports = {
  params: ({ args }) => {
    const name = args.name;
    const pascalCaseDriveEditorName = pascalCase(name);
    const paramCaseDriveEditorName = paramCase(name);
    return {
      rootDir: args.rootDir,
      name: args.name,
      appId: args.appId,
      isDragAndDropEnabled: args.isDragAndDropEnabled,
      allowedDocumentTypes: args.allowedDocumentTypes,
      pascalCaseDriveEditorName,
      paramCaseDriveEditorName,
    };
  },
};
