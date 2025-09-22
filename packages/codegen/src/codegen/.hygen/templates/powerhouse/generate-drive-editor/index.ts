export type Args = {
  name: string;
  rootDir: string;
  appId?: string;
  dragAndDropEnabled?: boolean;
  dragAndDropDocumentTypes?: string[];
};

export default {
  params: ({ args }: { args: Args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
      appId: args.appId,
      dragAndDropEnabled: args.dragAndDropEnabled,
      dragAndDropDocumentTypes: args.dragAndDropDocumentTypes,
    };
  },
};
