// @ts-check
module.exports = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      name: args.name,
      documentTypes: args.documentTypes
        .split(",")
        .filter((type) => type !== ""),
    };
  },
};
