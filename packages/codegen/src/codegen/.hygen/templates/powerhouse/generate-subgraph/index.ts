export type Args = {
  name: string;
  rootDir: string;
  loadFromFile: string;
};

export default {
  params: ({ args }: { args: Args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
      loadFromFile: args.loadFromFile,
    };
  },
};
