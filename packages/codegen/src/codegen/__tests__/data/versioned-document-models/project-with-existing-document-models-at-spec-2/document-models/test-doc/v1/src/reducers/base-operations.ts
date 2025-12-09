import type { TestDocBaseOperationsOperations } from "test/document-models/test-doc/v1";

export const testDocBaseOperationsOperations: TestDocBaseOperationsOperations =
  {
    setTestIdOperation(state, action) {
      state.id = action.input.id;
    },
    setTestNameOperation(state, action) {
      state.name = action.input.name;
    },
  };
