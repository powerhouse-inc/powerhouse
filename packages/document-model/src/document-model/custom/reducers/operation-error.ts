import { OperationError } from "../../gen";
import { DocumentModelOperationErrorOperations } from "../../gen/operation-error/operations";

const errorSorter = (order: string[]) => {
  const mapping: Record<string, number> = {};
  order.forEach((key, index) => (mapping[key] = index));
  return (a: OperationError, b: OperationError) =>
    (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const reducer: DocumentModelOperationErrorOperations = {
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
            latestSpec.modules[i].operations[j].errors[k].id == action.input.id
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
            latestSpec.modules[i].operations[j].errors[k].id == action.input.id
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
            latestSpec.modules[i].operations[j].errors[k].id == action.input.id
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
            latestSpec.modules[i].operations[j].errors[k].id == action.input.id
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
            errorSorter(action.input.order),
          );
        }
      }
    }
  },
};
