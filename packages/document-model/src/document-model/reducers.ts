/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  AddChangeLogItemInputSchema,
  AddModuleInputSchema,
  AddOperationErrorInputSchema,
  AddOperationExampleInputSchema,
  AddOperationInputSchema,
  AddStateExampleInputSchema,
  DeleteChangeLogItemInputSchema,
  DeleteModuleInputSchema,
  DeleteOperationErrorInputSchema,
  DeleteOperationExampleInputSchema,
  DeleteOperationInputSchema,
  DeleteStateExampleInputSchema,
  MoveOperationInputSchema,
  ReorderChangeLogItemsInputSchema,
  ReorderModuleOperationsInputSchema,
  ReorderModulesInputSchema,
  ReorderOperationErrorsInputSchema,
  ReorderOperationExamplesInputSchema,
  ReorderStateExamplesInputSchema,
  SetAuthorNameInputSchema,
  SetAuthorWebsiteInputSchema,
  SetInitialStateInputSchema,
  SetModelDescriptionInputSchema,
  SetModelExtensionInputSchema,
  SetModelIdInputSchema,
  SetModelNameInputSchema,
  SetModuleDescriptionInputSchema,
  SetModuleNameInputSchema,
  SetOperationDescriptionInputSchema,
  SetOperationErrorCodeInputSchema,
  SetOperationErrorDescriptionInputSchema,
  SetOperationErrorNameInputSchema,
  SetOperationErrorTemplateInputSchema,
  SetOperationNameInputSchema,
  SetOperationReducerInputSchema,
  SetOperationSchemaInputSchema,
  SetOperationScopeInputSchema,
  SetOperationTemplateInputSchema,
  SetStateSchemaInputSchema,
  UpdateChangeLogItemInputSchema,
  UpdateOperationExampleInputSchema,
  UpdateStateExampleInputSchema,
} from "./schemas.js";

function sorter<TItem extends { id: string }>(
  order: string[],
): (a: TItem, b: TItem) => number {
  const mapping: Record<string, number> = {};
  order.forEach((key, index) => (mapping[key] = index));
  return (a: TItem, b: TItem) =>
    (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
}

export const documentModelHeaderReducer: DocumentModelHeaderOperations = {
  setModelNameOperation(state, action) {
    state.name = action.input.name;
  },

  setModelIdOperation(state, action) {
    state.id = action.input.id;
  },

  setModelExtensionOperation(state, action) {
    state.extension = action.input.extension;
  },

  setModelDescriptionOperation(state, action) {
    state.description = action.input.description;
  },

  setAuthorNameOperation(state, action) {
    state.author = state.author || { name: "", website: null };
    state.author.name = action.input.authorName;
  },

  setAuthorWebsiteOperation(state, action) {
    state.author = state.author || { name: "", website: null };
    state.author.website = action.input.authorWebsite;
  },
};
export const documentModelModuleReducer: DocumentModelModuleOperations = {
  addModuleOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    latestSpec.modules.push({
      id: action.input.id,
      name: action.input.name,
      description: action.input.description || "",
      operations: [],
    });
  },

  setModuleNameOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      if (latestSpec.modules[i].id === action.input.id) {
        latestSpec.modules[i].name = action.input.name || "";
      }
    }
  },

  setModuleDescriptionOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      if (latestSpec.modules[i].id === action.input.id) {
        latestSpec.modules[i].description = action.input.description || "";
      }
    }
  },

  deleteModuleOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    latestSpec.modules = latestSpec.modules.filter(
      (m) => m.id != action.input.id,
    );
  },

  reorderModulesOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    latestSpec.modules.sort(sorter(action.input.order));
  },
};
export const documentModelOperationErrorReducer: DocumentModelOperationErrorOperations =
  {
    addOperationErrorOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          if (
            latestSpec.modules[i].operations[j].id == action.input.operationId
          ) {
            latestSpec.modules[i].operations[j].errors.push({
              id: action.input.id,
              name: action.input.errorName || "",
              code: action.input.errorCode || "",
              description: action.input.errorDescription || "",
              template: action.input.errorTemplate || "",
            });
          }
        }
      }
    },

    setOperationErrorCodeOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          for (
            let k = 0;
            k < latestSpec.modules[i].operations[j].errors.length;
            k++
          ) {
            if (
              latestSpec.modules[i].operations[j].errors[k].id ==
              action.input.id
            ) {
              latestSpec.modules[i].operations[j].errors[k].code =
                action.input.errorCode || "";
            }
          }
        }
      }
    },

    setOperationErrorNameOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          for (
            let k = 0;
            k < latestSpec.modules[i].operations[j].errors.length;
            k++
          ) {
            if (
              latestSpec.modules[i].operations[j].errors[k].id ==
              action.input.id
            ) {
              latestSpec.modules[i].operations[j].errors[k].name =
                action.input.errorName || "";
            }
          }
        }
      }
    },

    setOperationErrorDescriptionOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          for (
            let k = 0;
            k < latestSpec.modules[i].operations[j].errors.length;
            k++
          ) {
            if (
              latestSpec.modules[i].operations[j].errors[k].id ==
              action.input.id
            ) {
              latestSpec.modules[i].operations[j].errors[k].description =
                action.input.errorDescription || "";
            }
          }
        }
      }
    },

    setOperationErrorTemplateOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          for (
            let k = 0;
            k < latestSpec.modules[i].operations[j].errors.length;
            k++
          ) {
            if (
              latestSpec.modules[i].operations[j].errors[k].id ==
              action.input.id
            ) {
              latestSpec.modules[i].operations[j].errors[k].template =
                action.input.errorTemplate || "";
            }
          }
        }
      }
    },

    deleteOperationErrorOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          latestSpec.modules[i].operations[j].errors = latestSpec.modules[
            i
          ].operations[j].errors.filter((e) => e.id != action.input.id);
        }
      }
    },

    reorderOperationErrorsOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          if (
            latestSpec.modules[i].operations[j].id == action.input.operationId
          ) {
            latestSpec.modules[i].operations[j].errors.sort(
              sorter(action.input.order),
            );
          }
        }
      }
    },
  };

export const documentModelOperationExampleReducer: DocumentModelOperationExampleOperations =
  {
    addOperationExampleOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          if (
            latestSpec.modules[i].operations[j].id == action.input.operationId
          ) {
            latestSpec.modules[i].operations[j].examples.push({
              id: action.input.id,
              value: action.input.example,
            });
          }
        }
      }
    },

    updateOperationExampleOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          for (
            let k = 0;
            k < latestSpec.modules[i].operations[j].examples.length;
            k++
          ) {
            if (
              latestSpec.modules[i].operations[j].examples[k].id ==
              action.input.id
            ) {
              latestSpec.modules[i].operations[j].examples[k].value =
                action.input.example;
            }
          }
        }
      }
    },

    deleteOperationExampleOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          latestSpec.modules[i].operations[j].examples = latestSpec.modules[
            i
          ].operations[j].examples.filter((e) => e.id != action.input.id);
        }
      }
    },

    reorderOperationExamplesOperation(state, action) {
      const latestSpec = state.specifications[state.specifications.length - 1];
      for (let i = 0; i < latestSpec.modules.length; i++) {
        for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
          if (
            latestSpec.modules[i].operations[j].id == action.input.operationId
          ) {
            latestSpec.modules[i].operations[j].examples.sort(
              exampleSorter(action.input.order),
            );
          }
        }
      }
    },
  };

import type {
  AddChangeLogItemAction,
  CodeExample,
  DeleteChangeLogItemAction,
  DocumentModelHeaderOperations,
  DocumentModelModuleOperations,
  DocumentModelOperationErrorOperations,
  DocumentModelOperationExampleOperations,
  DocumentModelOperationOperations,
  DocumentModelPHState,
  DocumentModelVersioningOperations,
  OperationSpecification,
  ReorderChangeLogItemsAction,
  SetAuthorNameAction,
  SetAuthorWebsiteAction,
  SetModelDescriptionAction,
  SetModelExtensionAction,
  SetModelIdAction,
  SetModelNameAction,
  StateReducer,
  UpdateChangeLogItemAction,
} from "document-model";

const operationSorter = (order: string[]) => {
  const mapping: Record<string, number> = {};
  order.forEach((key, index) => (mapping[key] = index));
  return (a: OperationSpecification, b: OperationSpecification) =>
    (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const documentModelOperationReducer: DocumentModelOperationOperations = {
  addOperationOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      if (latestSpec.modules[i].id == action.input.moduleId) {
        latestSpec.modules[i].operations.push({
          id: action.input.id,
          name: action.input.name,
          description: action.input.description || "",
          schema: action.input.schema || "",
          template: action.input.template || action.input.description || "",
          reducer: action.input.reducer || "",
          errors: [],
          examples: [],
          scope: action.input.scope || "global",
        });
      }
    }
  },

  setOperationNameOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
        if (latestSpec.modules[i].operations[j].id == action.input.id) {
          latestSpec.modules[i].operations[j].name = action.input.name || "";
        }
      }
    }
  },

  setOperationScopeOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
        if (latestSpec.modules[i].operations[j].id == action.input.id) {
          latestSpec.modules[i].operations[j].scope =
            action.input.scope || "global";
        }
      }
    }
  },

  setOperationSchemaOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
        if (latestSpec.modules[i].operations[j].id == action.input.id) {
          latestSpec.modules[i].operations[j].schema =
            action.input.schema || "";
        }
      }
    }
  },

  setOperationDescriptionOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
        if (latestSpec.modules[i].operations[j].id == action.input.id) {
          latestSpec.modules[i].operations[j].description =
            action.input.description || "";
        }
      }
    }
  },

  setOperationTemplateOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
        if (latestSpec.modules[i].operations[j].id == action.input.id) {
          latestSpec.modules[i].operations[j].template =
            action.input.template || "";
        }
      }
    }
  },

  setOperationReducerOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      for (let j = 0; j < latestSpec.modules[i].operations.length; j++) {
        if (latestSpec.modules[i].operations[j].id == action.input.id) {
          latestSpec.modules[i].operations[j].reducer =
            action.input.reducer || "";
        }
      }
    }
  },

  moveOperationOperation(state, action) {
    const moveOperations: OperationSpecification[] = [];
    const latestSpec = state.specifications[state.specifications.length - 1];

    // Filter and collect
    for (let i = 0; i < latestSpec.modules.length; i++) {
      latestSpec.modules[i].operations = latestSpec.modules[
        i
      ].operations.filter((operation) => {
        if (operation.id == action.input.operationId) {
          moveOperations.push(operation);
          return false;
        }

        return true;
      });
    }

    // Inject in target modules
    for (let i = 0; i < latestSpec.modules.length; i++) {
      if (latestSpec.modules[i].id == action.input.newModuleId) {
        latestSpec.modules[i].operations.push(...moveOperations);
      }
    }
  },

  deleteOperationOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      latestSpec.modules[i].operations = latestSpec.modules[
        i
      ].operations.filter((operation) => operation.id != action.input.id);
    }
  },

  reorderModuleOperationsOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (let i = 0; i < latestSpec.modules.length; i++) {
      if (latestSpec.modules[i].id == action.input.moduleId) {
        latestSpec.modules[i].operations.sort(
          operationSorter(action.input.order),
        );
      }
    }
  },
};

import type { DocumentModelStateOperations, ScopeState } from "document-model";
import { isDocumentAction } from "../core/documents.js";
import { createReducer } from "../core/reducer.js";

const exampleSorter = (order: string[]) => {
  const mapping: Record<string, number> = {};
  order.forEach((key, index) => (mapping[key] = index));
  return (a: CodeExample, b: CodeExample) =>
    (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const documentModelStateSchemaReducer: DocumentModelStateOperations = {
  setStateSchemaOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (Object.keys(latestSpec.state).includes(action.input.scope)) {
      latestSpec.state[action.input.scope as keyof ScopeState].schema =
        action.input.schema;
    } else {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
  },

  setInitialStateOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (Object.keys(latestSpec.state).includes(action.input.scope)) {
      latestSpec.state[action.input.scope as keyof ScopeState].initialValue =
        action.input.initialValue;
    } else {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
  },

  addStateExampleOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (Object.keys(latestSpec.state).includes(action.input.scope)) {
      latestSpec.state[action.input.scope as keyof ScopeState].examples.push({
        id: action.input.id,
        value: action.input.example,
      });
    } else {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
  },

  updateStateExampleOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (!Object.keys(latestSpec.state).includes(action.input.scope)) {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
    const examples =
      latestSpec.state[action.input.scope as keyof ScopeState].examples;

    for (let i = 0; i < examples.length; i++) {
      if (examples[i].id == action.input.id) {
        examples[i].value = action.input.newExample;
      }
    }
  },

  deleteStateExampleOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (Object.keys(latestSpec.state).includes(action.input.scope)) {
      latestSpec.state[action.input.scope as keyof ScopeState].examples =
        latestSpec.state[
          action.input.scope as keyof ScopeState
        ].examples.filter((e) => e.id != action.input.id);
    } else {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
  },

  reorderStateExamplesOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (Object.keys(latestSpec.state).includes(action.input.scope)) {
      latestSpec.state[action.input.scope as keyof ScopeState].examples.sort(
        exampleSorter(action.input.order),
      );
    } else {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
  },
};

export const documentModelVersioningReducer: DocumentModelVersioningOperations =
  {
    addChangeLogItemOperation(state, action) {
      throw new Error(
        'Reducer "addChangeLogItemOperation" not yet implemented',
      );
    },

    updateChangeLogItemOperation(state, action) {
      throw new Error(
        'Reducer "updateChangeLogItemOperation" not yet implemented',
      );
    },

    deleteChangeLogItemOperation(state, action) {
      throw new Error(
        'Reducer "deleteChangeLogItemOperation" not yet implemented',
      );
    },

    reorderChangeLogItemsOperation(state, action) {
      throw new Error(
        'Reducer "reorderChangeLogItemsOperation" not yet implemented',
      );
    },

    releaseNewVersionOperation(state, action) {
      throw new Error(
        'Reducer "releaseNewVersionOperation" not yet implemented',
      );
    },
  };

export const documentModelStateReducer: StateReducer<DocumentModelPHState> = (
  state,
  action,
) => {
  if (isDocumentAction(action)) {
    return state;
  }

  switch (action.type) {
    case "SET_MODEL_NAME":
      SetModelNameInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelNameOperation(
        state.global,
        action as SetModelNameAction,
      );
      break;

    case "SET_MODEL_ID":
      SetModelIdInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelIdOperation(
        state.global,
        action as SetModelIdAction,
      );
      break;

    case "SET_MODEL_EXTENSION":
      SetModelExtensionInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelExtensionOperation(
        state.global,
        action as SetModelExtensionAction,
      );
      break;

    case "SET_MODEL_DESCRIPTION":
      SetModelDescriptionInputSchema().parse(action.input);
      documentModelHeaderReducer.setModelDescriptionOperation(
        state.global,
        action as SetModelDescriptionAction,
      );
      break;

    case "SET_AUTHOR_NAME":
      SetAuthorNameInputSchema().parse(action.input);
      documentModelHeaderReducer.setAuthorNameOperation(
        state.global,
        action as SetAuthorNameAction,
      );
      break;

    case "SET_AUTHOR_WEBSITE":
      SetAuthorWebsiteInputSchema().parse(action.input);
      documentModelHeaderReducer.setAuthorWebsiteOperation(
        state.global,
        action as SetAuthorWebsiteAction,
      );
      break;

    case "ADD_CHANGE_LOG_ITEM":
      AddChangeLogItemInputSchema().parse(action.input);
      documentModelVersioningReducer.addChangeLogItemOperation(
        state.global,
        action as AddChangeLogItemAction,
      );
      break;

    case "UPDATE_CHANGE_LOG_ITEM":
      UpdateChangeLogItemInputSchema().parse(action.input);
      documentModelVersioningReducer.updateChangeLogItemOperation(
        state.global,
        action as UpdateChangeLogItemAction,
      );
      break;

    case "DELETE_CHANGE_LOG_ITEM":
      DeleteChangeLogItemInputSchema().parse(action.input);
      documentModelVersioningReducer.deleteChangeLogItemOperation(
        state.global,
        action as DeleteChangeLogItemAction,
      );
      break;

    case "REORDER_CHANGE_LOG_ITEMS":
      ReorderChangeLogItemsInputSchema().parse(action.input);
      documentModelVersioningReducer.reorderChangeLogItemsOperation(
        state.global,
        action as ReorderChangeLogItemsAction,
      );
      break;

    case "RELEASE_NEW_VERSION":
      if (Object.keys(action.input as object).length > 0)
        throw new Error("Expected empty input for action RELEASE_NEW_VERSION");
      documentModelVersioningReducer.releaseNewVersionOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_MODULE":
      AddModuleInputSchema().parse(action.input);
      documentModelModuleReducer.addModuleOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_MODULE_NAME":
      SetModuleNameInputSchema().parse(action.input);
      documentModelModuleReducer.setModuleNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_MODULE_DESCRIPTION":
      SetModuleDescriptionInputSchema().parse(action.input);
      documentModelModuleReducer.setModuleDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_MODULE":
      DeleteModuleInputSchema().parse(action.input);
      documentModelModuleReducer.deleteModuleOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_MODULES":
      ReorderModulesInputSchema().parse(action.input);
      documentModelModuleReducer.reorderModulesOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION_ERROR":
      AddOperationErrorInputSchema().parse(action.input);
      documentModelOperationErrorReducer.addOperationErrorOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_CODE":
      SetOperationErrorCodeInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorCodeOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_NAME":
      SetOperationErrorNameInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_DESCRIPTION":
      SetOperationErrorDescriptionInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_ERROR_TEMPLATE":
      SetOperationErrorTemplateInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorTemplateOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION_ERROR":
      DeleteOperationErrorInputSchema().parse(action.input);
      documentModelOperationErrorReducer.deleteOperationErrorOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_OPERATION_ERRORS":
      ReorderOperationErrorsInputSchema().parse(action.input);
      documentModelOperationErrorReducer.reorderOperationErrorsOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION_EXAMPLE":
      AddOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.addOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "UPDATE_OPERATION_EXAMPLE":
      UpdateOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.updateOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION_EXAMPLE":
      DeleteOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.deleteOperationExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_OPERATION_EXAMPLES":
      ReorderOperationExamplesInputSchema().parse(action.input);
      documentModelOperationExampleReducer.reorderOperationExamplesOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_OPERATION":
      AddOperationInputSchema().parse(action.input);
      documentModelOperationReducer.addOperationOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_NAME":
      SetOperationNameInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationNameOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_SCOPE":
      SetOperationScopeInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationScopeOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_SCHEMA":
      SetOperationSchemaInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationSchemaOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_DESCRIPTION":
      SetOperationDescriptionInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationDescriptionOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_TEMPLATE":
      SetOperationTemplateInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationTemplateOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_OPERATION_REDUCER":
      SetOperationReducerInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationReducerOperation(
        state.global,
        action as any,
      );
      break;

    case "MOVE_OPERATION":
      MoveOperationInputSchema().parse(action.input);
      documentModelOperationReducer.moveOperationOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_OPERATION":
      DeleteOperationInputSchema().parse(action.input);
      documentModelOperationReducer.deleteOperationOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_MODULE_OPERATIONS":
      ReorderModuleOperationsInputSchema().parse(action.input);
      documentModelOperationReducer.reorderModuleOperationsOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_STATE_SCHEMA":
      SetStateSchemaInputSchema().parse(action.input);
      documentModelStateSchemaReducer.setStateSchemaOperation(
        state.global,
        action as any,
      );
      break;

    case "SET_INITIAL_STATE":
      SetInitialStateInputSchema().parse(action.input);
      documentModelStateSchemaReducer.setInitialStateOperation(
        state.global,
        action as any,
      );
      break;

    case "ADD_STATE_EXAMPLE":
      AddStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.addStateExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "UPDATE_STATE_EXAMPLE":
      UpdateStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.updateStateExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "DELETE_STATE_EXAMPLE":
      DeleteStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.deleteStateExampleOperation(
        state.global,
        action as any,
      );
      break;

    case "REORDER_STATE_EXAMPLES":
      ReorderStateExamplesInputSchema().parse(action.input);
      documentModelStateSchemaReducer.reorderStateExamplesOperation(
        state.global,
        action as any,
      );
      break;

    default:
      return state;
  }
};

export const documentModelReducer = createReducer<DocumentModelPHState>(
  documentModelStateReducer,
);
