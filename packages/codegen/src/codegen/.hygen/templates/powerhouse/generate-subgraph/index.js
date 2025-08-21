module.exports = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
      loadFromFile: args.loadFromFile,
    };
  },
};
