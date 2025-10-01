// @ts-check
const generateCustomSubgraph = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      subgraph: args.subgraph,
    };
  },
};
module.exports = generateCustomSubgraph;
