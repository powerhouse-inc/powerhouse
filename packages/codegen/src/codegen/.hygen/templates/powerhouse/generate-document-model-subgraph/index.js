const { paramCase } = require("change-case");

const generateDocumentModelMutations = {
  params: ({ args }) => {
    const documentModel = JSON.parse(args.documentModel);
    const latestSpec =
      documentModel.specifications[documentModel.specifications.length - 1];

    return {
      rootDir: args.rootDir,
      subgraph: args.subgraph,
      documentTypeId: documentModel.id,
      documentType: documentModel.name,
      schema: latestSpec.state.global.schema,
      modules: latestSpec.modules.map((m) => ({
        ...m,
        name: paramCase(m.name),
      })),
    };
  },
};
module.exports = generateDocumentModelMutations;
