import { type CodeExample, type ScopeState } from "../../gen/schema/types.js";
import { type DocumentModelStateOperations } from "../../gen/state/operations.js";

const exampleSorter = (order: string[]) => {
  const mapping: Record<string, number> = {};
  order.forEach((key, index) => (mapping[key] = index));
  return (a: CodeExample, b: CodeExample) =>
    (mapping[b.id] || 999999) - (mapping[a.id] || 999999);
};

export const reducer: DocumentModelStateOperations = {
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
