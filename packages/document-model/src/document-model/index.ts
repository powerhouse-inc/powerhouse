export { createExtendedState } from "./gen/document-model-utils.js";
export { reducer } from "./gen/reducer.js";
export type {
  DocumentModelAction,
  DocumentModelState,
  DocumentModelLocalState,
  DocumentModelDocument,
} from "./gen/types.js";
export {
  setModelName,
  setModelId,
  setModelDescription,
  setModelExtension,
  setAuthorName,
  setAuthorWebsite,
  setStateSchema,
  setInitialState,
  addModule,
  setModuleName,
  deleteModule,
  addOperation,
  setOperationName,
  setOperationSchema,
  setOperationDescription,
  deleteOperation,
  addOperationError,
  deleteOperationError,
  setOperationErrorName,
} from "./gen/creators.js";
export type {
  Module,
  Operation,
  OperationError,
  Author,
} from "./gen/schema/types.js";
