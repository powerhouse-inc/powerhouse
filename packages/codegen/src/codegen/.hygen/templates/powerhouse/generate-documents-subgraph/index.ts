export type Args = {
  documentModel: string;
  rootDir: string;
  subgraph: string;
};

const generateDocumentsSubgraph = {
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
export default generateDocumentsSubgraph;
