import type { DocumentModelState } from "document-model";

export type Args = {
  name: string;
  rootDir: string;
  documentModelsDir: string;
  documentTypes: string;
  documentTypesMap: string;
  editorId?: string;
  documentType?: string;
};

export default {
  params: ({ args }: { args: Args }) => {
    const documentTypes = args.documentTypes
      .split(",")
      .map((type) => type.trim())
      .filter((type) => type !== "");
    const documentTypesMap = JSON.parse(args.documentTypesMap) as Record<
      string,
      { name: string; importPath: string; documentModel: DocumentModelState }
    >;

    // if this editor is for a single document type, then the boilerplate will be customized to it
    const singleDocumentType =
      documentTypes.length === 1 ? documentTypes[0] : undefined;
    const documentType = singleDocumentType
      ? {
          ...documentTypesMap[singleDocumentType],
          type: singleDocumentType,
          modules:
            documentTypesMap[singleDocumentType].documentModel.specifications
              .at(-1)
              ?.modules.map((module) => ({
                name: module.name,
                actions: module.operations,
              })) || [],
        }
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
      documentType,
    };
  },
};
