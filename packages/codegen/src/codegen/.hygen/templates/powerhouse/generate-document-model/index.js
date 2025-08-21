const { paramCase } = require("change-case");
    
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

    return {
      rootDir: args.rootDir,
      documentModel: documentModelToString(documentModel),
      documentTypeId: documentModel.id,
      documentType: documentModel.name,
      extension: documentModel.extension,
      modules: latestSpec.modules.map((m) => ({
        ...m,
        name: paramCase(m.name),
      })),
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
