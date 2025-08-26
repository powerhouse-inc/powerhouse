// @ts-check
module.exports = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
    };
  },
};
