import type { TestDocBaseOperationsOperations } from "test/document-models/test-doc/v2";

export const testDocBaseOperationsOperations: TestDocBaseOperationsOperations =
  {
    setTestIdOperation(state, action) {
      state.id = action.input.id;
    },
    setTestNameOperation(state, action) {
      state.name = action.input.name;
    },
    setTestIdButDifferentOperation(state, action) {
      // TODO: implement setTestIdButDifferentOperation reducer
      throw new Error(
        "Reducer for 'setTestIdButDifferentOperation' not implemented.",
      );
    },
  };
