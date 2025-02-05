import type { BaseDocument, ExtendedState } from "document-model";
import type { AccountSnapshotState } from "./schema/types.js";
import type { AccountSnapshotLocalState } from "./schema/types.js";
import type { AccountSnapshotAction } from "./actions.js";

export type * from "./schema/types.js";
export type ExtendedAccountSnapshotState = ExtendedState<
  AccountSnapshotState,
  AccountSnapshotLocalState
>;
export type AccountSnapshotDocument = BaseDocument<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
>;
export {
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction,
};
