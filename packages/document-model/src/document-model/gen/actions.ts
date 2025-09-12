import type {
  DocumentModelHeaderAction,
  DocumentModelModuleAction,
  DocumentModelOperationAction,
  DocumentModelOperationErrorAction,
  DocumentModelOperationExampleAction,
  DocumentModelStateAction,
  DocumentModelVersioningAction,
} from "document-model";

export type DocumentModelAction =
  | DocumentModelHeaderAction
  | DocumentModelVersioningAction
  | DocumentModelModuleAction
  | DocumentModelOperationErrorAction
  | DocumentModelOperationExampleAction
  | DocumentModelOperationAction
  | DocumentModelStateAction;
