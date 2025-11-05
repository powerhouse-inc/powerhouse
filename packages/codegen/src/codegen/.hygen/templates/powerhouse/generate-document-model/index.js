// @ts-check
const { paramCase, pascalCase, camelCase } = require("change-case");
const { getModuleExports } = require("../utils.js");
function documentModelToString(documentModel) {
  return JSON.stringify(
    {
      ...documentModel,
      specifications: documentModel.specifications.map((s) => ({
        ...s,
        state: Object.keys(s.state).reduce((values, scope) => {
          const state = s.state[scope];
          return {
            ...values,
            [scope]: {
              ...state,
              // initial value has to be stringified twice
              // as it is expected to be a string
              initialValue: JSON.stringify(state.initialValue),
            },
          };
        }, {}),
      })),
    },
    null,
    2,
  );
}

module.exports = {
  params: ({ args }) => {
    const documentModel = JSON.parse(args.documentModel);
    const latestSpec =
      documentModel.specifications[documentModel.specifications.length - 1];
    const documentType = documentModel.name;
    const documentTypeId = documentModel.id;
    const rootDir = args.rootDir;
    const paramCaseDocumentType = paramCase(documentType);
    const pascalCaseDocumentType = pascalCase(documentType);
    const camelCaseDocumentType = camelCase(documentType);
    const documentTypeVariableName = `${camelCaseDocumentType}DocumentType`;
    const stateName = `${pascalCaseDocumentType}State`;
    const globalStateName = `${pascalCaseDocumentType}GlobalState`;
    const localStateName = `${pascalCaseDocumentType}LocalState`;
    const phStateName = `${pascalCaseDocumentType}PHState`;
    const phDocumentTypeName = `${pascalCaseDocumentType}Document`;
    const actionTypeName = `${pascalCaseDocumentType}Action`;
    const actionsTypeName = `${actionTypeName}s`;
    const actionsName = camelCase(actionsTypeName);
    const packageName = args.packageName;
    const documentModelDir = `${packageName}/document-models/${paramCaseDocumentType}`;
    const stateSchemaName = `${stateName}Schema`;
    const phDocumentSchemaName = `${phDocumentTypeName}Schema`;
    const isPhStateOfTypeFunctionName = `is${stateName}`;
    const assertIsPhStateOfTypeFunctionName = `assertIs${stateName}`;
    const isPhDocumentOfTypeFunctionName = `is${phDocumentTypeName}`;
    const assertIsPhDocumentOfTypeFunctionName = `assertIs${phDocumentTypeName}`;
    const useByIdHookName = `use${phDocumentTypeName}ById`;
    const useSelectedHookName = `useSelected${phDocumentTypeName}`;
    const useInSelectedDriveHookName = `use${phDocumentTypeName}sInSelectedDrive`;
    const useInSelectedFolderHookName = `use${phDocumentTypeName}sInSelectedFolder`;
    const moduleExports = getModuleExports(
      rootDir,
      /export\s+const\s+(\w+)\s*:\s*DocumentModelModule\s*<[^>]*>\s*=/,
      {
        paramCaseName: paramCaseDocumentType,
        pascalCaseName: pascalCaseDocumentType,
      },
    );
    return {
      rootDir,
      packageName,
      useByIdHookName,
      useSelectedHookName,
      useInSelectedDriveHookName,
      useInSelectedFolderHookName,
      documentModel: documentModelToString(documentModel),
      documentTypeVariableName,
      documentTypeId,
      documentType,
      camelCaseDocumentType,
      paramCaseDocumentType,
      pascalCaseDocumentType,
      stateName,
      globalStateName,
      localStateName,
      phDocumentTypeName,
      phStateName,
      actionTypeName,
      actionsTypeName,
      actionsName,
      stateSchemaName,
      phDocumentSchemaName,
      isPhDocumentOfTypeFunctionName,
      assertIsPhDocumentOfTypeFunctionName,
      isPhStateOfTypeFunctionName,
      assertIsPhStateOfTypeFunctionName,
      documentModelDir,
      extension: documentModel.extension || "phdm",
      modules: latestSpec.modules.map((m) => ({
        ...m,
        name: paramCase(m.name),
      })),
      moduleExports,
      fileExtension: documentModel.extension,
      hasLocalSchema: latestSpec.state.local.schema !== "",
      ...getInitialStates(latestSpec.state),
    };
  },
};

function getInitialStates(scopeState) {
  const { global, local } = scopeState;
  const scopes = { global, local };

  Object.entries(scopes).forEach(([scope, state]) => {
    if (!isEmptyStateSchema(state.schema) && state.initialValue === "") {
      throw new Error(
        `${
          scope.charAt(0).toLocaleUpperCase() + scope.slice(1)
        } scope has a defined schema but is missing an initial value.`,
      );
    }
  });

  return {
    initialGlobalState: handleEmptyState(global.initialValue),
    initialLocalState: handleEmptyState(local.initialValue),
  };
}

function isEmptyStateSchema(schema) {
  return schema === "" || !schema.includes("{");
}

function handleEmptyState(state) {
  return state === "" ? "{}" : state;
}
