// @ts-check
module.exports = {
  params: ({ args }) => {
    const documentTypes = args.documentTypes
      .split(",")
      .map((type) => type.trim())
      .filter((type) => type !== "");
    const documentTypesMap = JSON.parse(args.documentTypesMap);

    // if this editor is for a single document type, then the boilerplate will be customized to it
    const singleDocumentType =
      documentTypes.length === 1 ? documentTypes[0] : undefined;
    const documentType = singleDocumentType
      ? { ...documentTypesMap[singleDocumentType], type: singleDocumentType }
      : undefined;

    return {
      rootDir: args.rootDir,
      documentModelsDir: args.documentModelsDir,
      name: args.name,
      documentTypes: args.documentTypes
        .split(",")
        .filter((type) => type !== ""),
      documentTypesMap,
      editorId: args.editorId,
      editorName: args.editorName,
      documentType,
    };
  },
};
