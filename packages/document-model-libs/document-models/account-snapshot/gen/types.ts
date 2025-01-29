import type { Document, ExtendedState } from "document-model/document";
import type { AccountSnapshotState } from "./schema/types";
import type { AccountSnapshotLocalState } from "./schema/types";
import type { AccountSnapshotAction } from "./actions";

export { z } from "./schema";
export type * from "./schema/types";
export type ExtendedAccountSnapshotState = ExtendedState<
  AccountSnapshotState,
  AccountSnapshotLocalState
>;
export type AccountSnapshotDocument = Document<
  AccountSnapshotState,
  AccountSnapshotAction,
  AccountSnapshotLocalState
>;
export {
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction,
};
