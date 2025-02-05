/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { AccountSnapshotSnapshotOperations } from "@document-models/account-snapshot/gen/snapshot/operations.js";

export const reducer: AccountSnapshotSnapshotOperations = {
  setIdOperation(state, action) {
    state.id = action.input.id;
  },
  setOwnerIdOperation(state, action) {
    state.ownerId = action.input.ownerId;
  },
  setOwnerTypeOperation(state, action) {
    state.ownerType = action.input.ownerType;
  },
  setPeriodOperation(state, action) {
    state.period = action.input.period;
  },
  setStartOperation(state, action) {
    state.start = action.input.start;
  },
  setEndOperation(state, action) {
    state.end = action.input.end;
  },
};
