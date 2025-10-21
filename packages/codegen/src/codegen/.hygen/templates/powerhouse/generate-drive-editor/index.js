// @ts-check
module.exports = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
      appId: args.appId,
     isDragAndDropEnabled: args.isDragAndDropEnabled,
     allowedDocumentTypes: args.allowedDocumentTypes,
    };
  },
};
