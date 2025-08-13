export type Args = {
  rootDir: string;
  subgraph: string;
};

const generateCustomSubgraph = {
  params: ({
    args,
  }: {
    args: Args;
  }): {
    rootDir: string;
    subgraph: string;
  } => {
    return {
      rootDir: args.rootDir,
      subgraph: args.subgraph,
    };
  },
};
export default generateCustomSubgraph;
