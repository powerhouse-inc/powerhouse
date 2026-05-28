import { isDocumentAction } from "./documents.js";
import { createReducer } from "./reducer.js";
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
import type {
  AddChangeLogItemAction,
  AddModuleAction,
  AddOperationAction,
  AddOperationErrorAction,
  AddOperationExampleAction,
  AddStateExampleAction,
  DeleteChangeLogItemAction,
  DeleteModuleAction,
  DeleteOperationAction,
  DeleteOperationErrorAction,
  DeleteOperationExampleAction,
  DeleteStateExampleAction,
  DocumentModelHeaderOperations,
  DocumentModelModuleOperations,
  DocumentModelOperationErrorOperations,
  DocumentModelOperationExampleOperations,
  DocumentModelOperationOperations,
  DocumentModelPHState,
  DocumentModelStateOperations,
  DocumentModelVersioningOperations,
  MoveOperationAction,
  OperationSpecification,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  ReorderModuleOperationsAction,
  ReorderModulesAction,
  ReorderOperationErrorsAction,
  ReorderOperationExamplesAction,
  ReorderStateExamplesAction,
  ScopeState,
  SetAuthorNameAction,
  SetAuthorWebsiteAction,
  SetInitialStateAction,
  SetModelDescriptionAction,
  SetModelExtensionAction,
  SetModelIdAction,
  SetModelNameAction,
  SetModuleDescriptionAction,
  SetModuleNameAction,
  SetOperationDescriptionAction,
  SetOperationErrorCodeAction,
  SetOperationErrorDescriptionAction,
  SetOperationErrorNameAction,
  SetOperationErrorTemplateAction,
  SetOperationNameAction,
  SetOperationReducerAction,
  SetOperationSchemaAction,
  SetOperationScopeAction,
  SetOperationTemplateAction,
  SetStateSchemaAction,
  StateReducer,
  UpdateChangeLogItemAction,
  UpdateOperationExampleAction,
  UpdateStateExampleAction,
} from "./types.js";
import {
  assertModuleIdUnique,
  assertOperationErrorIdUnique,
  assertOperationExampleIdUnique,
  assertOperationIdUnique,
  findModuleOrThrow,
  findOperationErrorOrThrow,
  findOperationExampleOrThrow,
  findOperationOrThrow,
  validateOperationName,
} from "./validation.js";

/**
 * Reorder `items` by the position of their id in `order`. Ids not listed in
 * `order` keep their relative position after the listed ones. Throws if `order`
 * references an id that isn't present, so a stale or mistyped id fails loudly
 * instead of silently producing an arbitrary order.
 */
function orderBy<TItem extends { id: string }>(
  items: TItem[],
  order: string[],
): TItem[] {
  const ids = new Set(items.map((item) => item.id));
  for (const id of order) {
    if (!ids.has(id)) {
      throw new Error(`Cannot reorder: unknown id "${id}"`);
    }
  }
  const rank = new Map(order.map((id, index) => [id, index]));
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const ra = rank.get(a.item.id) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.item.id) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.index - b.index;
    })
    .map(({ item }) => item);
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
    assertModuleIdUnique(state, action.input.id);
    const latestSpec = state.specifications[state.specifications.length - 1];
    latestSpec.modules.push({
      id: action.input.id,
      name: action.input.name,
      description: action.input.description || "",
      operations: [],
    });
  },

  setModuleNameOperation(state, action) {
    const targetModule = findModuleOrThrow(state, action.input.id);
    targetModule.name = action.input.name || "";
  },

  setModuleDescriptionOperation(state, action) {
    const targetModule = findModuleOrThrow(state, action.input.id);
    targetModule.description = action.input.description || "";
  },

  deleteModuleOperation(state, action) {
    findModuleOrThrow(state, action.input.id);
    const latestSpec = state.specifications[state.specifications.length - 1];
    latestSpec.modules = latestSpec.modules.filter(
      (m) => m.id != action.input.id,
    );
  },

  reorderModulesOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    latestSpec.modules = orderBy(latestSpec.modules, action.input.order);
  },
};
export const documentModelOperationErrorReducer: DocumentModelOperationErrorOperations =
  {
    addOperationErrorOperation(state, action) {
      const targetOp = findOperationOrThrow(state, action.input.operationId);
      assertOperationErrorIdUnique(state, action.input.id);
      targetOp.errors.push({
        id: action.input.id,
        name: action.input.errorName || "",
        code: action.input.errorCode || "",
        description: action.input.errorDescription || "",
        template: action.input.errorTemplate || "",
      });
    },

    setOperationErrorCodeOperation(state, action) {
      const error = findOperationErrorOrThrow(state, action.input.id);
      error.code = action.input.errorCode || "";
    },

    setOperationErrorNameOperation(state, action) {
      const error = findOperationErrorOrThrow(state, action.input.id);
      error.name = action.input.errorName || "";
    },

    setOperationErrorDescriptionOperation(state, action) {
      const error = findOperationErrorOrThrow(state, action.input.id);
      error.description = action.input.errorDescription || "";
    },

    setOperationErrorTemplateOperation(state, action) {
      const error = findOperationErrorOrThrow(state, action.input.id);
      error.template = action.input.errorTemplate || "";
    },

    deleteOperationErrorOperation(state, action) {
      // Tolerate duplicate ids here: the filter removes every copy, so delete
      // is the recovery path for a document that already holds duplicates.
      const latestSpec = state.specifications[state.specifications.length - 1];
      const exists = latestSpec.modules.some((mod) =>
        mod.operations.some((op) =>
          op.errors.some((e) => e.id === action.input.id),
        ),
      );
      if (!exists) {
        throw new Error(
          `Operation error "${action.input.id}" not found in the latest specification`,
        );
      }
      for (const mod of latestSpec.modules) {
        for (const op of mod.operations) {
          op.errors = op.errors.filter((e) => e.id != action.input.id);
        }
      }
    },

    reorderOperationErrorsOperation(state, action) {
      const targetOp = findOperationOrThrow(state, action.input.operationId);
      targetOp.errors = orderBy(targetOp.errors, action.input.order);
    },
  };

export const documentModelOperationExampleReducer: DocumentModelOperationExampleOperations =
  {
    addOperationExampleOperation(state, action) {
      const targetOp = findOperationOrThrow(state, action.input.operationId);
      assertOperationExampleIdUnique(state, action.input.id);
      targetOp.examples.push({
        id: action.input.id,
        value: action.input.example,
      });
    },

    updateOperationExampleOperation(state, action) {
      const example = findOperationExampleOrThrow(state, action.input.id);
      example.value = action.input.example;
    },

    deleteOperationExampleOperation(state, action) {
      // Tolerate duplicate ids here: the filter removes every copy, so delete
      // is the recovery path for a document that already holds duplicates.
      const latestSpec = state.specifications[state.specifications.length - 1];
      const exists = latestSpec.modules.some((mod) =>
        mod.operations.some((op) =>
          op.examples.some((e) => e.id === action.input.id),
        ),
      );
      if (!exists) {
        throw new Error(
          `Operation example "${action.input.id}" not found in the latest specification`,
        );
      }
      for (const mod of latestSpec.modules) {
        for (const op of mod.operations) {
          op.examples = op.examples.filter((e) => e.id != action.input.id);
        }
      }
    },

    reorderOperationExamplesOperation(state, action) {
      const targetOp = findOperationOrThrow(state, action.input.operationId);
      targetOp.examples = orderBy(targetOp.examples, action.input.order);
    },
  };
export const documentModelOperationReducer: DocumentModelOperationOperations = {
  addOperationOperation(state, action) {
    validateOperationName(action.input.name, state);
    assertOperationIdUnique(state, action.input.id);
    const targetModule = findModuleOrThrow(state, action.input.moduleId);
    targetModule.operations.push({
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
  },

  setOperationNameOperation(state, action) {
    if (action.input.name) {
      validateOperationName(action.input.name, state, action.input.id);
    }
    const targetOp = findOperationOrThrow(state, action.input.id);
    targetOp.name = action.input.name || "";
  },

  setOperationScopeOperation(state, action) {
    const targetOp = findOperationOrThrow(state, action.input.id);
    const latestSpec = state.specifications[state.specifications.length - 1];
    const allowedScopes = Object.keys(latestSpec.state);
    if (action.input.scope && !allowedScopes.includes(action.input.scope)) {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
    targetOp.scope = action.input.scope || "global";
  },

  setOperationSchemaOperation(state, action) {
    const targetOp = findOperationOrThrow(state, action.input.id);
    targetOp.schema = action.input.schema || "";
  },

  setOperationDescriptionOperation(state, action) {
    const targetOp = findOperationOrThrow(state, action.input.id);
    targetOp.description = action.input.description || "";
  },

  setOperationTemplateOperation(state, action) {
    const targetOp = findOperationOrThrow(state, action.input.id);
    targetOp.template = action.input.template || "";
  },

  setOperationReducerOperation(state, action) {
    const targetOp = findOperationOrThrow(state, action.input.id);
    targetOp.reducer = action.input.reducer || "";
  },

  moveOperationOperation(state, action) {
    // Validate fully before mutating: resolve the destination module and the
    // operation to move first, so a missing/ambiguous target aborts the move
    // without having already removed the operation from its source module.
    const targetModule = findModuleOrThrow(state, action.input.newModuleId);
    const latestSpec = state.specifications[state.specifications.length - 1];

    const matches = latestSpec.modules.flatMap((mod) =>
      mod.operations.filter((op) => op.id === action.input.operationId),
    );
    if (matches.length === 0) {
      throw new Error(
        `Operation "${action.input.operationId}" not found in the latest specification`,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        `Operation "${action.input.operationId}" is duplicated in the latest specification`,
      );
    }
    const moved = matches[0];

    for (const mod of latestSpec.modules) {
      mod.operations = mod.operations.filter(
        (op) => op.id !== action.input.operationId,
      );
    }
    targetModule.operations.push(moved);
  },

  deleteOperationOperation(state, action) {
    findOperationOrThrow(state, action.input.id);
    const latestSpec = state.specifications[state.specifications.length - 1];
    for (const mod of latestSpec.modules) {
      mod.operations = mod.operations.filter(
        (operation) => operation.id != action.input.id,
      );
    }
  },

  reorderModuleOperationsOperation(state, action) {
    const targetModule = findModuleOrThrow(state, action.input.moduleId);
    targetModule.operations = orderBy(
      targetModule.operations,
      action.input.order,
    );
  },
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

    const example = examples.find((e) => e.id == action.input.id);
    if (!example) {
      throw new Error(
        `State example "${action.input.id}" not found in scope "${action.input.scope}"`,
      );
    }
    example.value = action.input.newExample;
  },

  deleteStateExampleOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (!Object.keys(latestSpec.state).includes(action.input.scope)) {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
    const scopeState = latestSpec.state[action.input.scope as keyof ScopeState];
    if (!scopeState.examples.some((e) => e.id == action.input.id)) {
      throw new Error(
        `State example "${action.input.id}" not found in scope "${action.input.scope}"`,
      );
    }
    scopeState.examples = scopeState.examples.filter(
      (e) => e.id != action.input.id,
    );
  },

  reorderStateExamplesOperation(state, action) {
    const latestSpec = state.specifications[state.specifications.length - 1];
    if (!Object.keys(latestSpec.state).includes(action.input.scope)) {
      throw new Error(`Invalid scope: ${action.input.scope}`);
    }
    const scopeState = latestSpec.state[action.input.scope as keyof ScopeState];
    scopeState.examples = orderBy(scopeState.examples, action.input.order);
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
      const latestSpec = state.specifications[state.specifications.length - 1];

      const copiedModules = latestSpec.modules.map((module) => ({
        ...module,
        operations: module.operations.map((op) => ({
          ...op,
          errors: op.errors.map((err) => ({ ...err })),
          examples: op.examples.map((ex) => ({ ...ex })),
        })),
      }));

      const copiedState = {
        global: {
          ...latestSpec.state.global,
          examples: latestSpec.state.global.examples.map((ex) => ({ ...ex })),
        },
        local: {
          ...latestSpec.state.local,
          examples: latestSpec.state.local.examples.map((ex) => ({ ...ex })),
        },
      };

      const newSpec = {
        version: latestSpec.version + 1,
        changeLog: [],
        state: copiedState,
        modules: copiedModules,
      };

      state.specifications.push(newSpec);
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
        action as ReleaseNewVersionAction,
      );
      break;

    case "ADD_MODULE":
      AddModuleInputSchema().parse(action.input);
      documentModelModuleReducer.addModuleOperation(
        state.global,
        action as AddModuleAction,
      );
      break;

    case "SET_MODULE_NAME":
      SetModuleNameInputSchema().parse(action.input);
      documentModelModuleReducer.setModuleNameOperation(
        state.global,
        action as SetModuleNameAction,
      );
      break;

    case "SET_MODULE_DESCRIPTION":
      SetModuleDescriptionInputSchema().parse(action.input);
      documentModelModuleReducer.setModuleDescriptionOperation(
        state.global,
        action as SetModuleDescriptionAction,
      );
      break;

    case "DELETE_MODULE":
      DeleteModuleInputSchema().parse(action.input);
      documentModelModuleReducer.deleteModuleOperation(
        state.global,
        action as DeleteModuleAction,
      );
      break;

    case "REORDER_MODULES":
      ReorderModulesInputSchema().parse(action.input);
      documentModelModuleReducer.reorderModulesOperation(
        state.global,
        action as ReorderModulesAction,
      );
      break;

    case "ADD_OPERATION_ERROR":
      AddOperationErrorInputSchema().parse(action.input);
      documentModelOperationErrorReducer.addOperationErrorOperation(
        state.global,
        action as AddOperationErrorAction,
      );
      break;

    case "SET_OPERATION_ERROR_CODE":
      SetOperationErrorCodeInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorCodeOperation(
        state.global,
        action as SetOperationErrorCodeAction,
      );
      break;

    case "SET_OPERATION_ERROR_NAME":
      SetOperationErrorNameInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorNameOperation(
        state.global,
        action as SetOperationErrorNameAction,
      );
      break;

    case "SET_OPERATION_ERROR_DESCRIPTION":
      SetOperationErrorDescriptionInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorDescriptionOperation(
        state.global,
        action as SetOperationErrorDescriptionAction,
      );
      break;

    case "SET_OPERATION_ERROR_TEMPLATE":
      SetOperationErrorTemplateInputSchema().parse(action.input);
      documentModelOperationErrorReducer.setOperationErrorTemplateOperation(
        state.global,
        action as SetOperationErrorTemplateAction,
      );
      break;

    case "DELETE_OPERATION_ERROR":
      DeleteOperationErrorInputSchema().parse(action.input);
      documentModelOperationErrorReducer.deleteOperationErrorOperation(
        state.global,
        action as DeleteOperationErrorAction,
      );
      break;

    case "REORDER_OPERATION_ERRORS":
      ReorderOperationErrorsInputSchema().parse(action.input);
      documentModelOperationErrorReducer.reorderOperationErrorsOperation(
        state.global,
        action as ReorderOperationErrorsAction,
      );
      break;

    case "ADD_OPERATION_EXAMPLE":
      AddOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.addOperationExampleOperation(
        state.global,
        action as AddOperationExampleAction,
      );
      break;

    case "UPDATE_OPERATION_EXAMPLE":
      UpdateOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.updateOperationExampleOperation(
        state.global,
        action as UpdateOperationExampleAction,
      );
      break;

    case "DELETE_OPERATION_EXAMPLE":
      DeleteOperationExampleInputSchema().parse(action.input);
      documentModelOperationExampleReducer.deleteOperationExampleOperation(
        state.global,
        action as DeleteOperationExampleAction,
      );
      break;

    case "REORDER_OPERATION_EXAMPLES":
      ReorderOperationExamplesInputSchema().parse(action.input);
      documentModelOperationExampleReducer.reorderOperationExamplesOperation(
        state.global,
        action as ReorderOperationExamplesAction,
      );
      break;

    case "ADD_OPERATION":
      AddOperationInputSchema().parse(action.input);
      documentModelOperationReducer.addOperationOperation(
        state.global,
        action as AddOperationAction,
      );
      break;

    case "SET_OPERATION_NAME":
      SetOperationNameInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationNameOperation(
        state.global,
        action as SetOperationNameAction,
      );
      break;

    case "SET_OPERATION_SCOPE":
      SetOperationScopeInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationScopeOperation(
        state.global,
        action as SetOperationScopeAction,
      );
      break;

    case "SET_OPERATION_SCHEMA":
      SetOperationSchemaInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationSchemaOperation(
        state.global,
        action as SetOperationSchemaAction,
      );
      break;

    case "SET_OPERATION_DESCRIPTION":
      SetOperationDescriptionInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationDescriptionOperation(
        state.global,
        action as SetOperationDescriptionAction,
      );
      break;

    case "SET_OPERATION_TEMPLATE":
      SetOperationTemplateInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationTemplateOperation(
        state.global,
        action as SetOperationTemplateAction,
      );
      break;

    case "SET_OPERATION_REDUCER":
      SetOperationReducerInputSchema().parse(action.input);
      documentModelOperationReducer.setOperationReducerOperation(
        state.global,
        action as SetOperationReducerAction,
      );
      break;

    case "MOVE_OPERATION":
      MoveOperationInputSchema().parse(action.input);
      documentModelOperationReducer.moveOperationOperation(
        state.global,
        action as MoveOperationAction,
      );
      break;

    case "DELETE_OPERATION":
      DeleteOperationInputSchema().parse(action.input);
      documentModelOperationReducer.deleteOperationOperation(
        state.global,
        action as DeleteOperationAction,
      );
      break;

    case "REORDER_MODULE_OPERATIONS":
      ReorderModuleOperationsInputSchema().parse(action.input);
      documentModelOperationReducer.reorderModuleOperationsOperation(
        state.global,
        action as ReorderModuleOperationsAction,
      );
      break;

    case "SET_STATE_SCHEMA":
      SetStateSchemaInputSchema().parse(action.input);
      documentModelStateSchemaReducer.setStateSchemaOperation(
        state.global,
        action as SetStateSchemaAction,
      );
      break;

    case "SET_INITIAL_STATE":
      SetInitialStateInputSchema().parse(action.input);
      documentModelStateSchemaReducer.setInitialStateOperation(
        state.global,
        action as SetInitialStateAction,
      );
      break;

    case "ADD_STATE_EXAMPLE":
      AddStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.addStateExampleOperation(
        state.global,
        action as AddStateExampleAction,
      );
      break;

    case "UPDATE_STATE_EXAMPLE":
      UpdateStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.updateStateExampleOperation(
        state.global,
        action as UpdateStateExampleAction,
      );
      break;

    case "DELETE_STATE_EXAMPLE":
      DeleteStateExampleInputSchema().parse(action.input);
      documentModelStateSchemaReducer.deleteStateExampleOperation(
        state.global,
        action as DeleteStateExampleAction,
      );
      break;

    case "REORDER_STATE_EXAMPLES":
      ReorderStateExamplesInputSchema().parse(action.input);
      documentModelStateSchemaReducer.reorderStateExamplesOperation(
        state.global,
        action as ReorderStateExamplesAction,
      );
      break;

    default:
      return state;
  }
};

export const documentModelReducer = createReducer<DocumentModelPHState>(
  documentModelStateReducer,
);
