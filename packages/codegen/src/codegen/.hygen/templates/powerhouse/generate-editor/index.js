const {
  pascalCase,
  paramCase,
  capitalCase,
  camelCase,
} = require("change-case");
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
    const packageName = args.packageName;
    const pascalCaseEditorName = pascalCase(args.name);
    const paramCaseEditorName = paramCase(args.name);
    const pascalCaseDocumentType = pascalCase(documentType?.name);
    const paramCaseDocumentType = paramCase(documentType?.name);
    const camelCaseDocumentType = camelCase(documentType?.name);
    const documentVariableName = documentType ? `${camelCaseDocumentType}Document` : "document";
    const phDocumentTypeName = documentType ? `${pascalCaseDocumentType}Document` : "Document";
    const actionTypeName = `${pascalCaseDocumentType}Action`;
    const documentModelDir = `${packageName}/document-models/${paramCaseDocumentType}`;
    const hooksDir = `${packageName}/editors/hooks`;
    const isDocumentOfTypeFunctionName = `is${phDocumentTypeName}`;
    const assertIsDocumentOfTypeFunctionName = `assertIs${phDocumentTypeName}`;
    const useByIdHookName = documentType
      ? `use${phDocumentTypeName}ById`
      : "useDocumentById";
    const useSelectedHookName = documentType
      ? `useSelected${phDocumentTypeName}`
      : "useSelectedDocument";
    const useInSelectedDriveHookName = documentType
      ? `use${phDocumentTypeName}sInSelectedDrive`
      : "useDocumentsInSelectedDrive";
    const useInSelectedFolderHookName = documentType
      ? `use${phDocumentTypeName}sInSelectedFolder`
      : "useDocumentsInSelectedFolder";
    const editNameComponentName = documentType ? `Edit${pascalCaseDocumentType}Name` : "EditDocumentName";
    return {
      rootDir: args.rootDir,
      documentModelsDir: args.documentModelsDir,
      name: args.name,
      pascalCaseEditorName,
      paramCaseEditorName,
      pascalCaseDocumentType,
      paramCaseDocumentType,
      camelCaseDocumentType,
      documentVariableName,
      phDocumentTypeName,
      actionTypeName,
      hooksDir,
      documentModelDir,
      isDocumentOfTypeFunctionName,
      assertIsDocumentOfTypeFunctionName,
      useByIdHookName,
      useSelectedHookName,
      useInSelectedDriveHookName,
      useInSelectedFolderHookName,
      editNameComponentName,
      documentTypes: args.documentTypes
        .split(",")
        .filter((type) => type !== ""),
      documentTypesMap,
      editorId: args.editorId,
      documentType,
      packageName,
    };
  },
};
