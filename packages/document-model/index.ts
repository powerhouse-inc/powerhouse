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
  DocumentSpecification,
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
export { loadFromFile as documentModelLoadFromFile } from "#document-model/gen/utils.js";
export { applyMixins, BaseDocumentClass } from "#document/object.js";
export type {
  PHAuthState,
  PHBaseState,
  PHDocumentHeader,
  PHDocumentMeta,
  PHDocumentSignatureInfo,
  PHDocumentState,
} from "#document/ph-types.js";
export type {
  Action,
  ActionContext,
  ActionErrorCallback,
  ActionSigner,
  ActionWithAttachment,
  App,
  AttachmentInput,
  BaseDocument,
  CreateChildDocumentInput,
  CreateDocument,
  CreateState,
  DocumentAction,
  DocumentModelLib,
  DocumentModelModule,
  DocumentModelUtils,
  DocumentOperations,
  EditorDispatch,
  EditorModule,
  EditorProps,
  FileRegistry,
  ImportScriptModule,
  InputMaybe,
  LoadFromFile,
  LoadFromInput,
  Manifest,
  Maybe,
  NOOPAction,
  Operation,
  ActionSignatureContext as OperationSignatureContext,
  PartialState,
  PHDocument,
  Reducer,
  ReducerOptions,
  SaveToFile,
  SaveToFileHandle,
  Signal,
  SignalDispatch,
  SignalResult,
  Signature,
  StateReducer,
  SubgraphModule,
  User,
  ValidationError,
} from "#document/types.js";
export {
  baseCreateDocument,
  createAction,
  createReducer,
  hashDocumentStateForScope,
  isDocumentAction,
  replayDocument,
} from "#document/utils/base.js";
export {
  buildOperationSignature,
  buildOperationSignatureMessage,
  buildSignedAction,
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
  createUnsignedHeader as createPresignedHeader,
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
export {
  actionContext,
  createAuthState,
  createBaseState,
  createDocumentState,
  defaultAuthState,
  defaultBaseState,
  defaultDocumentState,
} from "#document/ph-factories.js";
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
