import { paramCase } from "change-case";
import type { DocumentModelState, ScopeState } from "document-model";

function documentModelToString(documentModel: DocumentModelState) {
  return JSON.stringify(
    {
      ...documentModel,
      specifications: documentModel.specifications.map((s) => ({
        ...s,
        state: Object.keys(s.state).reduce((values, scope) => {
          const state = s.state[scope as keyof typeof s.state];
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

export type Args = {
  documentModel: string;
  rootDir: string;
};

export default {
  params: ({
    args,
  }: {
    args: Args;
  }): {
    rootDir: string;
    documentModel: string;
    documentTypeId: string;
    documentType: string;
    extension: string;
    modules: Array<{ name: string; [key: string]: any }>;
    fileExtension: string;
    hasLocalSchema: boolean;
    initialGlobalState: string;
    initialLocalState: string;
  } => {
    const documentModel = JSON.parse(args.documentModel) as DocumentModelState;
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

function getInitialStates(scopeState: ScopeState) {
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

function isEmptyStateSchema(schema: string) {
  return schema === "" || !schema.includes("{");
}

function handleEmptyState(state: string) {
  return state === "" ? "{}" : state;
}
