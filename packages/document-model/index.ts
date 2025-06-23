export {
  addModule,
  addOperation,
  addOperationError,
  deleteModule,
  deleteOperation,
  deleteOperationError,
  setAuthorName,
  setAuthorWebsite,
  setInitialState,
  setModelDescription,
  setModelExtension,
  setModelId,
  setModelName,
  setModuleName,
  setOperationDescription,
  setOperationErrorName,
  setOperationName,
  setOperationSchema,
  setStateSchema,
} from "#document-model/gen/creators.js";
export { reducer as documentModelReducer } from "#document-model/gen/reducer.js";
export type {
  Author,
  DocumentModelInput,
  Operation as DocumentModelOperation,
  Module,
  Scalars,
  ScopeState,
} from "#document-model/gen/schema/types.js";
export type {
  DocumentModelAction,
  DocumentModelDocument,
  DocumentModelLocalState,
  DocumentModelState,
} from "#document-model/gen/types.js";
export {
  createExtendedState as documentModelCreateExtendedState,
  loadFromFile as documentModelLoadFromFile,
} from "#document-model/gen/utils.js";
export { applyMixins, BaseDocumentClass } from "#document/object.js";
export type { PHDocumentHeader } from "#document/ph-types.js";
export type {
  Action,
  ActionContext,
  ActionErrorCallback,
  ActionFromDocument,
  ActionSigner,
  App,
  AttachmentInput,
  BaseAction,
  BaseActionWithAttachment,
  BaseDocument,
  BaseState,
  BaseStateFromDocument,
  CreateChildDocumentInput,
  CreateDocument,
  CreateExtendedState,
  CreateState,
  CustomAction,
  DocumentAction,
  DocumentHeader,
  DocumentModelLib,
  DocumentModelModule,
  DocumentModelUtils,
  DocumentOperations,
  EditorDispatch,
  EditorModule,
  EditorProps,
  ExtendedState,
  ExtendedStateFromDocument,
  FileRegistry,
  GlobalStateFromDocument,
  InputMaybe,
  LoadFromFile,
  LoadFromInput,
  LocalStateFromDocument,
  Manifest,
  Maybe,
  NOOPAction,
  Operation,
  OperationFromDocument,
  OperationScope,
  OperationsFromDocument,
  OperationSignatureContext,
  PartialState,
  PHDocument,
  PHReducer,
  Reducer,
  ReducerOptions,
  SaveToFile,
  SaveToFileHandle,
  Signal,
  SignalDispatch,
  Signature,
  StateReducer,
  SynchronizationUnitInput,
  User,
  ValidationError,
} from "#document/types.js";
export {
  baseCreateDocument,
  baseCreateExtendedState,
  createAction,
  createReducer,
  hashDocumentStateForScope,
  isDocumentAction,
  replayDocument,
} from "#document/utils/base.js";
export {
  buildOperationSignature,
  buildOperationSignatureMessage,
  buildSignedOperation,
  generateId,
} from "#document/utils/crypto.js";
export {
  baseLoadFromFile,
  baseLoadFromInput,
  baseSaveToFile,
  baseSaveToFileHandle,
  createZip,
} from "#document/utils/file.js";
export {
  createPresignedHeader,
  validateHeader,
} from "#document/utils/header.js";

export {
  validateInitialState,
  validateModule,
  validateModuleOperation,
  validateModules,
  validateStateSchemaName,
} from "#document-model/custom/utils.js";
export type { OperationError as DocumentModelOperationError } from "#document-model/gen/schema/types.js";
export { createDocument, createState } from "#document-model/gen/utils.js";
export { documentModelDocumentModelModule } from "#document-model/module.js";
export {
  actions,
  loadState,
  noop,
  prune,
  redo,
  setName,
  undo,
} from "#document/actions/creators.js";
export type { EditorContext } from "#document/types.js";
export {
  attachBranch,
  garbageCollect,
  garbageCollectDocumentOperations,
  groupOperationsByScope,
  merge,
  precedes,
  removeExistingOperations,
  reshuffleByTimestamp,
  skipHeaderOperations,
  sortOperations,
} from "#document/utils/document-helpers.js";
