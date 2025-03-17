import { type DocumentModelOperationOperations } from "../../gen/operation/operations.js";
import { type Operation } from "../../gen/schema/types.js";

const operationSorter = (order: string[]) => {
  const mapping: Record<string, number> = {};
  order.forEach((key, index) => (mapping[key] = index));
  return (a: Operation, b: Operation) =>
    (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const reducer: DocumentModelOperationOperations = {
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
    const moveOperations: Operation[] = [];
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
