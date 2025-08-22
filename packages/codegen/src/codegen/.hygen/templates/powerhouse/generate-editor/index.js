// @ts-check
module.exports = {
  params: ({ args }) => {
    return {
      rootDir: args.rootDir,
      documentModelsDir: args.documentModelsDir,
      name: args.name,
      documentTypes: args.documentTypes
        .split(",")
        .filter((type) => type !== ""),
      documentTypesMap: JSON.parse(args.documentTypesMap),
      editorId: args.editorId,
    };
  },
};
