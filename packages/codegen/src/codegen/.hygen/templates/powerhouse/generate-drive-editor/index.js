// @ts-check
module.exports = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
      appId: args.appId,
      dragAndDropEnabled: args.dragAndDropEnabled,
      dragAndDropDocumentTypes: args.dragAndDropDocumentTypes,
    };
  },
};
