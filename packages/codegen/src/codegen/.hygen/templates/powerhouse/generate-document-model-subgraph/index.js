// @ts-check
const { paramCase, pascalCase, camelCase } = require("change-case");

module.exports = {
  params: ({ args }) => {
    const documentModel = JSON.parse(args.documentModel);
    const latestSpec =
      documentModel.specifications[documentModel.specifications.length - 1];
    const documentType = documentModel.name;
    const pascalCaseDocumentType = pascalCase(documentType);
    const camelCaseDocumentType = camelCase(documentType);
    const phDocumentTypeName = `${pascalCaseDocumentType}Document`;
    const documentTypeVariableName = `${camelCaseDocumentType}DocumentType`;
    const packageName = args.packageName;
    const paramCaseDocumentType = paramCase(documentType);
    const documentModelDir = `${packageName}/document-models/${paramCaseDocumentType}`;
    return {
      phDocumentTypeName,
      documentTypeVariableName,
      pascalCaseDocumentType,
      camelCaseDocumentType,
      documentModelDir,
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
