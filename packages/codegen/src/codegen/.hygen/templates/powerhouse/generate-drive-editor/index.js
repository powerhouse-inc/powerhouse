// @ts-check
module.exports = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
      appId: args.appId,
      appName: args.appName,
      dragAndDropEnabled: args.dragAndDropEnabled,
      dragAndDropDocumentTypes: args.dragAndDropDocumentTypes,
    };
  },
};
