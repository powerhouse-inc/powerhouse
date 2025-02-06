import type { DocumentModelModule } from "document-model";
import type {
  AccountSnapshotAction,
  AccountSnapshotLocalState,
  AccountSnapshotState,
} from "./gen/types.js";

export type * from "./gen/types.js";
export type * from "./gen/schema/types.js";

export type AccountSnapshotDocumentModelModule = DocumentModelModule<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
>;
