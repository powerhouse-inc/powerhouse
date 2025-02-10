export type Args = {
  name: string;
  rootDir: string;
};

export default {
  params: ({ args }: { args: Args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
    };
  },
};
