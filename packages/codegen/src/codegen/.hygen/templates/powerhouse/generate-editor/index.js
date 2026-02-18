const {
  pascalCase,
  kebabCase,
  capitalCase,
  camelCase,
} = require("change-case");
const { readdirSync, readFileSync } = require("fs");
const { join } = require("path");

// @ts-check
module.exports = {
  params: ({ args }) => {
    const rootDir = args.rootDir;
    const editorDirName = args.editorDirName || kebabCase(args.name);
    const editorDir = join(rootDir, editorDirName);
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
    const kebabCaseEditorName = kebabCase(args.name);
    const pascalCaseDocumentType = pascalCase(documentType?.name);
    const kebabCaseDocumentType = kebabCase(documentType?.name);
    const camelCaseDocumentType = camelCase(documentType?.name);
    const documentVariableName = documentType
      ? `${camelCaseDocumentType}Document`
      : "document";
    const phDocumentTypeName = documentType
      ? `${pascalCaseDocumentType}Document`
      : "Document";
    const actionTypeName = `${pascalCaseDocumentType}Action`;
    const documentModelDir = `${packageName}/document-models/${kebabCaseDocumentType}`;
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
    const editNameComponentName = "EditName"

    return {
      rootDir,
      editorDir,
      documentModelsDir: args.documentModelsDir,
      name: args.name,
      pascalCaseEditorName,
      kebabCaseEditorName,
      pascalCaseDocumentType,
      kebabCaseDocumentType,
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
