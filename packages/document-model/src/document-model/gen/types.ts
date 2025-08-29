import type {
  BaseDocument,
  BaseState,
  DocumentModelLocalState,
  DocumentModelState,
} from "document-model";
export type * from "./header/types.js";
export type * from "./module/types.js";
export type * from "./operation/types.js";
export type * from "./operation-error/types.js";
export type * from "./operation-example/types.js";
export type * from "./state/types.js";
export type * from "./versioning/types.js";
export type * from "./schema/types.js";
export type * from "./actions.js";
export type ExtendedDocumentModelState = BaseState<
  DocumentModelState,
  DocumentModelLocalState
>;
export type DocumentModelDocument = BaseDocument<
  DocumentModelState,
  DocumentModelLocalState
>;
