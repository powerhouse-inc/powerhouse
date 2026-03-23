import { ZodError } from "zod";
import {
  ab2hex,
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  hex2ab,
} from "./crypto.js";
import type { PHDocument } from "./documents.js";
import {
  InvalidActionInputError,
  InvalidActionInputZodError,
} from "./errors.js";
import type { Operation, OperationContext } from "./operations.js";
import {
  AddChangeLogItemInputSchema,
  AddModuleInputSchema,
  AddOperationErrorInputSchema,
  AddOperationExampleInputSchema,
  AddOperationInputSchema,
  AddStateExampleInputSchema,
  DeleteChangeLogItemInputSchema,
  DeleteModuleInputSchema,
  DeleteOperationErrorInputSchema,
  DeleteOperationExampleInputSchema,
  DeleteOperationInputSchema,
  DeleteStateExampleInputSchema,
  LoadStateActionInputSchema,
  MoveOperationInputSchema,
  PruneActionInputSchema,
  RedoActionInputSchema,
  ReorderChangeLogItemsInputSchema,
  ReorderModuleOperationsInputSchema,
  ReorderModulesInputSchema,
  ReorderOperationErrorsInputSchema,
  ReorderOperationExamplesInputSchema,
  ReorderStateExamplesInputSchema,
  SetAuthorNameInputSchema,
  SetAuthorWebsiteInputSchema,
  SetInitialStateInputSchema,
  SetModelDescriptionInputSchema,
  SetModelExtensionInputSchema,
  SetModelIdInputSchema,
  SetModelNameInputSchema,
  SetModuleDescriptionInputSchema,
  SetModuleNameInputSchema,
  SetNameActionInputSchema,
  SetOperationDescriptionInputSchema,
  SetOperationErrorCodeInputSchema,
  SetOperationErrorDescriptionInputSchema,
  SetOperationErrorNameInputSchema,
  SetOperationErrorTemplateInputSchema,
  SetOperationNameInputSchema,
  SetOperationReducerInputSchema,
  SetOperationSchemaInputSchema,
  SetOperationScopeInputSchema,
  SetOperationTemplateInputSchema,
  SetStateSchemaInputSchema,
  UndoActionInputSchema,
  UpdateChangeLogItemInputSchema,
  UpdateOperationExampleInputSchema,
  UpdateStateExampleInputSchema,
} from "./schemas.js";
import type {
  ActionSigner,
  AppActionSigner,
  Signature,
  UserActionSigner,
} from "./signatures.js";
import type { PHBaseState } from "./state.js";
import type {
  ActionSignatureContext,
  ActionSigningHandler,
  ActionVerificationHandler,
  AddChangeLogItemAction,
  AddChangeLogItemInput,
  AddModuleAction,
  AddModuleInput,
  AddOperationAction,
  AddOperationErrorAction,
  AddOperationErrorInput,
  AddOperationExampleAction,
  AddOperationExampleInput,
  AddOperationInput,
  AddStateExampleAction,
  AddStateExampleInput,
  DeleteChangeLogItemAction,
  DeleteChangeLogItemInput,
  DeleteModuleAction,
  DeleteModuleInput,
  DeleteOperationAction,
  DeleteOperationErrorAction,
  DeleteOperationErrorInput,
  DeleteOperationExampleAction,
  DeleteOperationExampleInput,
  DeleteOperationInput,
  DeleteStateExampleAction,
  DeleteStateExampleInput,
  LoadStateAction,
  MoveOperationAction,
  MoveOperationInput,
  NOOPAction,
  RedoAction,
  Reducer,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  ReorderChangeLogItemsInput,
  ReorderModuleOperationsAction,
  ReorderModuleOperationsInput,
  ReorderModulesAction,
  ReorderModulesInput,
  ReorderOperationErrorsAction,
  ReorderOperationErrorsInput,
  ReorderOperationExamplesAction,
  ReorderOperationExamplesInput,
  ReorderStateExamplesAction,
  ReorderStateExamplesInput,
  SchemaPruneAction,
  SetAuthorNameAction,
  SetAuthorNameInput,
  SetAuthorWebsiteAction,
  SetAuthorWebsiteInput,
  SetInitialStateAction,
  SetInitialStateInput,
  SetModelDescriptionAction,
  SetModelDescriptionInput,
  SetModelExtensionAction,
  SetModelExtensionInput,
  SetModelIdAction,
  SetModelIdInput,
  SetModelNameAction,
  SetModelNameInput,
  SetModuleDescriptionAction,
  SetModuleDescriptionInput,
  SetModuleNameAction,
  SetModuleNameInput,
  SetNameAction,
  SetOperationDescriptionAction,
  SetOperationDescriptionInput,
  SetOperationErrorCodeAction,
  SetOperationErrorCodeInput,
  SetOperationErrorDescriptionAction,
  SetOperationErrorDescriptionInput,
  SetOperationErrorNameAction,
  SetOperationErrorNameInput,
  SetOperationErrorTemplateAction,
  SetOperationErrorTemplateInput,
  SetOperationNameAction,
  SetOperationNameInput,
  SetOperationReducerAction,
  SetOperationReducerInput,
  SetOperationSchemaAction,
  SetOperationSchemaInput,
  SetOperationScopeAction,
  SetOperationScopeInput,
  SetOperationTemplateAction,
  SetOperationTemplateInput,
  SetStateSchemaAction,
  SetStateSchemaInput,
  UndoAction,
  UpdateChangeLogItemAction,
  UpdateChangeLogItemInput,
  UpdateOperationExampleAction,
  UpdateOperationExampleInput,
  UpdateStateExampleAction,
  UpdateStateExampleInput,
} from "./types.js";
import { deriveOperationId, generateId } from "./utils.js";

/**
 * Cancels the last `count` operations.
 *
 * @param count - Number of operations to cancel
 * @category Actions
 */
export const undo = (count = 1, scope = "global") =>
  createAction<UndoAction>(
    "UNDO",
    { count },
    undefined,
    UndoActionInputSchema,
    scope,
  );

/**
 * Cancels the last `count` {@link undo | UNDO} operations.
 *
 * @param count - Number of UNDO operations to cancel
 * @category Actions
 */
export const redo = (count = 1, scope = "global") =>
  createAction<RedoAction>(
    "REDO",
    { count },
    undefined,
    RedoActionInputSchema,
    scope,
  );

/**
 * Joins multiple operations into a single {@link loadState | LOAD_STATE} operation.
 *
 * @remarks
 * Useful to keep operations history smaller. Operations to prune are selected by index,
 * similar to the {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/slice | slice} method in Arrays.
 *
 * @param start - Index of the first operation to prune
 * @param end - Index of the last operation to prune
 * @category Actions
 */
export const prune = (start?: number, end?: number, scope = "global") =>
  createAction<SchemaPruneAction>(
    "PRUNE",
    { start, end },
    undefined,
    PruneActionInputSchema,
    scope,
  );

/**
 * Replaces the state of the document.
 *
 * @remarks
 * This action shouldn't be used directly. It is dispatched by the {@link prune} action.
 *
 * @param state - State to be set in the document.
 * @param operations - Number of operations that were removed from the previous state.
 * @category Actions
 */
export const loadState = <TState extends PHBaseState = PHBaseState>(
  state: TState & { name: string },
  operations: number,
) =>
  createAction<LoadStateAction>(
    "LOAD_STATE",
    { state, operations },
    undefined,
    LoadStateActionInputSchema,
  );

export const noop = (scope = "global") =>
  createAction<NOOPAction>("NOOP", {}, undefined, undefined, scope);

// TODO improve base actions type

/**
 * Helper function to be used by action creators.
 *
 * @remarks
 * Creates an action with the given type and input properties. The input
 * properties default to an empty object.
 *
 * @typeParam A - Type of the action to be returned.
 *
 * @param type - The type of the action.
 * @param input - The input properties of the action.
 * @param attachments - The attachments included in the action.
 * @param validator - The validator to use for the input properties.
 * @param scope - The scope of the action, can either be 'global' or 'local'.
 * @param skip - The number of operations to skip before this new action is applied.
 *
 * @throws Error if the type is empty or not a string.
 *
 * @returns The new action.
 */
export function createAction<TAction extends Action>(
  type: TAction["type"],
  input?: TAction["input"],
  attachments?: TAction["attachments"],
  validator?: () => { parse(v: unknown): TAction["input"] },
  scope: Action["scope"] = "global",
): TAction {
  if (!type) throw new Error("Empty action type");
  if (typeof type !== "string")
    throw new Error(`Invalid action type: ${JSON.stringify(type)}`);

  const action: Action = {
    id: generateId(),
    timestampUtcMs: new Date().toISOString(),
    type,
    input,
    scope,
  };

  if (attachments) action.attachments = attachments;

  try {
    validator?.().parse(action.input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InvalidActionInputZodError(error.issues);
    }
    throw new InvalidActionInputError(error);
  }

  return action as TAction;
}

/**
 * This function should be used instead of { ...action } to ensure
 * that extra properties are not included in the action.
 */
export const actionFromAction = (action: Action): Action => {
  return {
    id: action.id,
    timestampUtcMs: action.timestampUtcMs,
    type: action.type,
    input: action.input,
    scope: action.scope,
    context: action.context,
    attachments: action.attachments,
  };
};

export const operationFromAction = (
  action: Action,
  index: number,
  skip: number,
  context: OperationContext,
): Operation => {
  return {
    ...action,
    action,
    id: deriveOperationId(
      context.documentId,
      context.scope,
      context.branch,
      action.id,
    ),
    timestampUtcMs: action.timestampUtcMs,
    hash: "",
    error: undefined,

    index,
    skip,
  };
};

export const operationFromOperation = (
  operation: Operation,
  index: number,
  skip: number,
  context: OperationContext,
): Operation => {
  const id = deriveOperationId(
    context.documentId,
    context.scope,
    context.branch,
    operation.action.id,
  );

  return {
    ...operation,
    hash: "",
    error: undefined,
    index,
    skip,
    id,
  };
};

export const operationWithContext = (
  operation: Operation,
  context: ActionContext,
): Operation => {
  if (!operation.action) {
    throw new Error("Operation has no action");
  }

  return {
    ...operation,
    action: {
      ...operation.action,
      context,
    },
  };
};

export const actionContext = (): ActionContext => ({});

export const actionSigner = (
  user: UserActionSigner,
  app: AppActionSigner,
  signatures: Signature[] = [],
): ActionSigner => ({
  user,
  app,
  signatures,
});

export async function buildOperationSignature(
  context: ActionSignatureContext,
  signMethod: ActionSigningHandler,
): Promise<Signature> {
  const params = buildOperationSignatureParams(context);
  const message = buildOperationSignatureMessage(params);
  const signature = await signMethod(message);
  return [...params, `0x${ab2hex(signature)}`];
}

export async function buildSignedAction<
  TState extends PHBaseState = PHBaseState,
>(
  action: Action,
  reducer: Reducer<TState>,
  document: PHDocument<TState>,
  signer: ActionSigner,
  signHandler: ActionSigningHandler,
) {
  const result = reducer(document, action, undefined, {
    //reuseHash: true,
    reuseOperationResultingState: true,
  });
  const scopeOperations = result.operations[action.scope];
  if (!scopeOperations) {
    throw new Error(`No operations found for scope: ${action.scope}`);
  }
  const operation = scopeOperations.at(-1);
  if (!operation) {
    throw new Error("Action was not applied");
  }

  const previousStateHash = scopeOperations.at(-2)?.hash ?? "";
  const signature = await buildOperationSignature(
    {
      documentId: document.header.id,
      signer,
      action,
      previousStateHash,
    },
    signHandler,
  );

  const actionContext: ActionContext = {
    signer: actionSigner(signer.user, signer.app, [
      ...signer.signatures,
      signature,
    ]),
  };

  return operationWithContext(operation, actionContext);
}

export async function verifyOperationSignature(
  signature: Signature,
  signer: Omit<ActionSigner, "signatures">,
  verifyHandler: ActionVerificationHandler,
) {
  const publicKey = signer.app.key;
  const params = signature.slice(0, 4) as [string, string, string, string];
  const signatureBytes = hex2ab(signature[4]);
  const expectedMessage = buildOperationSignatureMessage(params);
  return verifyHandler(publicKey, signatureBytes, expectedMessage);
}

/**
 * Changes the name of the document.
 *
 * @param name - The name to be set in the document.
 * @category Actions
 */
export const setName = (name: string | { name: string }) =>
  createAction<SetNameAction>(
    "SET_NAME",
    typeof name === "string" ? { name } : name,
    undefined,
    SetNameActionInputSchema,
    // TODO: THIS IS A BUG: This needs to be changed to a HEADER scope action if it's changing the header.
    "global",
  );
export const setModelName = (input: SetModelNameInput) =>
  createAction<SetModelNameAction>(
    "SET_MODEL_NAME",
    { ...input },
    undefined,
    SetModelNameInputSchema,
    "global",
  );

export const setModelId = (input: SetModelIdInput) =>
  createAction<SetModelIdAction>(
    "SET_MODEL_ID",
    { ...input },
    undefined,
    SetModelIdInputSchema,
    "global",
  );

export const setModelExtension = (input: SetModelExtensionInput) =>
  createAction<SetModelExtensionAction>(
    "SET_MODEL_EXTENSION",
    { ...input },
    undefined,
    SetModelExtensionInputSchema,
    "global",
  );

export const setModelDescription = (input: SetModelDescriptionInput) =>
  createAction<SetModelDescriptionAction>(
    "SET_MODEL_DESCRIPTION",
    { ...input },
    undefined,
    SetModelDescriptionInputSchema,
    "global",
  );

export const setAuthorName = (input: SetAuthorNameInput) =>
  createAction<SetAuthorNameAction>(
    "SET_AUTHOR_NAME",
    { ...input },
    undefined,
    SetAuthorNameInputSchema,
    "global",
  );

export const setAuthorWebsite = (input: SetAuthorWebsiteInput) =>
  createAction<SetAuthorWebsiteAction>(
    "SET_AUTHOR_WEBSITE",
    { ...input },
    undefined,
    SetAuthorWebsiteInputSchema,
    "global",
  );

export const addModule = (input: AddModuleInput) =>
  createAction<AddModuleAction>(
    "ADD_MODULE",
    { ...input },
    undefined,
    AddModuleInputSchema,
    "global",
  );

export const setModuleName = (input: SetModuleNameInput) =>
  createAction<SetModuleNameAction>(
    "SET_MODULE_NAME",
    { ...input },
    undefined,
    SetModuleNameInputSchema,
    "global",
  );

export const setModuleDescription = (input: SetModuleDescriptionInput) =>
  createAction<SetModuleDescriptionAction>(
    "SET_MODULE_DESCRIPTION",
    { ...input },
    undefined,
    SetModuleDescriptionInputSchema,
    "global",
  );

export const deleteModule = (input: DeleteModuleInput) =>
  createAction<DeleteModuleAction>(
    "DELETE_MODULE",
    { ...input },
    undefined,
    DeleteModuleInputSchema,
    "global",
  );

export const reorderModules = (input: ReorderModulesInput) =>
  createAction<ReorderModulesAction>(
    "REORDER_MODULES",
    { ...input },
    undefined,
    ReorderModulesInputSchema,
    "global",
  );

export const addOperation = (input: AddOperationInput) =>
  createAction<AddOperationAction>(
    "ADD_OPERATION",
    { ...input },
    undefined,
    AddOperationInputSchema,
    "global",
  );

export const setOperationName = (input: SetOperationNameInput) =>
  createAction<SetOperationNameAction>(
    "SET_OPERATION_NAME",
    { ...input },
    undefined,
    SetOperationNameInputSchema,
    "global",
  );

export const setOperationScope = (input: SetOperationScopeInput) =>
  createAction<SetOperationScopeAction>(
    "SET_OPERATION_SCOPE",
    { ...input },
    undefined,
    SetOperationScopeInputSchema,
    "global",
  );

export const setOperationSchema = (input: SetOperationSchemaInput) =>
  createAction<SetOperationSchemaAction>(
    "SET_OPERATION_SCHEMA",
    { ...input },
    undefined,
    SetOperationSchemaInputSchema,
    "global",
  );

export const setOperationDescription = (input: SetOperationDescriptionInput) =>
  createAction<SetOperationDescriptionAction>(
    "SET_OPERATION_DESCRIPTION",
    { ...input },
    undefined,
    SetOperationDescriptionInputSchema,
    "global",
  );

export const setOperationTemplate = (input: SetOperationTemplateInput) =>
  createAction<SetOperationTemplateAction>(
    "SET_OPERATION_TEMPLATE",
    { ...input },
    undefined,
    SetOperationTemplateInputSchema,
    "global",
  );

export const setOperationReducer = (input: SetOperationReducerInput) =>
  createAction<SetOperationReducerAction>(
    "SET_OPERATION_REDUCER",
    { ...input },
    undefined,
    SetOperationReducerInputSchema,
    "global",
  );

export const moveOperation = (input: MoveOperationInput) =>
  createAction<MoveOperationAction>(
    "MOVE_OPERATION",
    { ...input },
    undefined,
    MoveOperationInputSchema,
    "global",
  );

export const deleteOperation = (input: DeleteOperationInput) =>
  createAction<DeleteOperationAction>(
    "DELETE_OPERATION",
    { ...input },
    undefined,
    DeleteOperationInputSchema,
    "global",
  );

export const reorderModuleOperations = (input: ReorderModuleOperationsInput) =>
  createAction<ReorderModuleOperationsAction>(
    "REORDER_MODULE_OPERATIONS",
    { ...input },
    undefined,
    ReorderModuleOperationsInputSchema,
    "global",
  );

export const addOperationError = (input: AddOperationErrorInput) =>
  createAction<AddOperationErrorAction>(
    "ADD_OPERATION_ERROR",
    { ...input },
    undefined,
    AddOperationErrorInputSchema,
    "global",
  );

export const setOperationErrorCode = (input: SetOperationErrorCodeInput) =>
  createAction<SetOperationErrorCodeAction>(
    "SET_OPERATION_ERROR_CODE",
    { ...input },
    undefined,
    SetOperationErrorCodeInputSchema,
    "global",
  );

export const setOperationErrorName = (input: SetOperationErrorNameInput) =>
  createAction<SetOperationErrorNameAction>(
    "SET_OPERATION_ERROR_NAME",
    { ...input },
    undefined,
    SetOperationErrorNameInputSchema,
    "global",
  );

export const setOperationErrorDescription = (
  input: SetOperationErrorDescriptionInput,
) =>
  createAction<SetOperationErrorDescriptionAction>(
    "SET_OPERATION_ERROR_DESCRIPTION",
    { ...input },
    undefined,
    SetOperationErrorDescriptionInputSchema,
    "global",
  );

export const setOperationErrorTemplate = (
  input: SetOperationErrorTemplateInput,
) =>
  createAction<SetOperationErrorTemplateAction>(
    "SET_OPERATION_ERROR_TEMPLATE",
    { ...input },
    undefined,
    SetOperationErrorTemplateInputSchema,
    "global",
  );

export const deleteOperationError = (input: DeleteOperationErrorInput) =>
  createAction<DeleteOperationErrorAction>(
    "DELETE_OPERATION_ERROR",
    { ...input },
    undefined,
    DeleteOperationErrorInputSchema,
    "global",
  );

export const reorderOperationErrors = (input: ReorderOperationErrorsInput) =>
  createAction<ReorderOperationErrorsAction>(
    "REORDER_OPERATION_ERRORS",
    { ...input },
    undefined,
    ReorderOperationErrorsInputSchema,
    "global",
  );

export const addOperationExample = (input: AddOperationExampleInput) =>
  createAction<AddOperationExampleAction>(
    "ADD_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    AddOperationExampleInputSchema,
    "global",
  );

export const updateOperationExample = (input: UpdateOperationExampleInput) =>
  createAction<UpdateOperationExampleAction>(
    "UPDATE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    UpdateOperationExampleInputSchema,
    "global",
  );

export const deleteOperationExample = (input: DeleteOperationExampleInput) =>
  createAction<DeleteOperationExampleAction>(
    "DELETE_OPERATION_EXAMPLE",
    { ...input },
    undefined,
    DeleteOperationExampleInputSchema,
    "global",
  );

export const reorderOperationExamples = (
  input: ReorderOperationExamplesInput,
) =>
  createAction<ReorderOperationExamplesAction>(
    "REORDER_OPERATION_EXAMPLES",
    { ...input },
    undefined,
    ReorderOperationExamplesInputSchema,
    "global",
  );

export const operationExampleCreators = {
  addOperationExample,
  updateOperationExample,
  deleteOperationExample,
  reorderOperationExamples,
};

export const setStateSchema = (input: SetStateSchemaInput) =>
  createAction<SetStateSchemaAction>(
    "SET_STATE_SCHEMA",
    { ...input },
    undefined,
    SetStateSchemaInputSchema,
    "global",
  );

export const setInitialState = (input: SetInitialStateInput) =>
  createAction<SetInitialStateAction>(
    "SET_INITIAL_STATE",
    { ...input },
    undefined,
    SetInitialStateInputSchema,
    "global",
  );

export const addStateExample = (input: AddStateExampleInput) =>
  createAction<AddStateExampleAction>(
    "ADD_STATE_EXAMPLE",
    { ...input },
    undefined,
    AddStateExampleInputSchema,
    "global",
  );

export const updateStateExample = (input: UpdateStateExampleInput) =>
  createAction<UpdateStateExampleAction>(
    "UPDATE_STATE_EXAMPLE",
    { ...input },
    undefined,
    UpdateStateExampleInputSchema,
    "global",
  );

export const deleteStateExample = (input: DeleteStateExampleInput) =>
  createAction<DeleteStateExampleAction>(
    "DELETE_STATE_EXAMPLE",
    { ...input },
    undefined,
    DeleteStateExampleInputSchema,
    "global",
  );

export const reorderStateExamples = (input: ReorderStateExamplesInput) =>
  createAction<ReorderStateExamplesAction>(
    "REORDER_STATE_EXAMPLES",
    { ...input },
    undefined,
    ReorderStateExamplesInputSchema,
    "global",
  );

export const addChangeLogItem = (input: AddChangeLogItemInput) =>
  createAction<AddChangeLogItemAction>(
    "ADD_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    AddChangeLogItemInputSchema,
    "global",
  );

export const updateChangeLogItem = (input: UpdateChangeLogItemInput) =>
  createAction<UpdateChangeLogItemAction>(
    "UPDATE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    UpdateChangeLogItemInputSchema,
    "global",
  );

export const deleteChangeLogItem = (input: DeleteChangeLogItemInput) =>
  createAction<DeleteChangeLogItemAction>(
    "DELETE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    DeleteChangeLogItemInputSchema,
    "global",
  );

export const reorderChangeLogItems = (input: ReorderChangeLogItemsInput) =>
  createAction<ReorderChangeLogItemsAction>(
    "REORDER_CHANGE_LOG_ITEMS",
    { ...input },
    undefined,
    ReorderChangeLogItemsInputSchema,
    "global",
  );

export const releaseNewVersion = () =>
  createAction<ReleaseNewVersionAction>(
    "RELEASE_NEW_VERSION",
    {},
    undefined,
    undefined,
    "global",
  );

export const baseActions = {
  setName,
  undo,
  redo,
  prune,
  loadState,
  noop,
};

export const documentModelActions = {
  setModelName,
  setModelId,
  setModelExtension,
  setModelDescription,
  setAuthorName,
  setAuthorWebsite,
  addModule,
  setModuleName,
  setModuleDescription,
  deleteModule,
  reorderModules,
  addOperation,
  setOperationName,
  setOperationScope,
  setOperationSchema,
  setOperationDescription,
  setOperationTemplate,
  setOperationReducer,
  moveOperation,
  deleteOperation,
  reorderModuleOperations,
  addOperationError,
  setOperationErrorCode,
  setOperationErrorName,
  setOperationErrorDescription,
  setOperationErrorTemplate,
  deleteOperationError,
  reorderOperationErrors,
  setStateSchema,
  setInitialState,
  addStateExample,
  updateStateExample,
  deleteStateExample,
  reorderStateExamples,
  addChangeLogItem,
  updateChangeLogItem,
  deleteChangeLogItem,
  reorderChangeLogItems,
  releaseNewVersion,
};

export const actions = { ...baseActions, ...documentModelActions };

/**
 * The context of an action.
 */
export type ActionContext = {
  /** The index of the previous operation, showing intended ordering. */
  prevOpIndex?: number;

  /** The hash of the previous operation, showing intended state. */
  prevOpHash?: string;

  /** A nonce, to cover specific signing attacks and to prevent replay attacks from no-ops. */
  nonce?: string;

  /** The signer of the action. */
  signer?: ActionSigner;
};

/**
 * Defines the basic structure of an action.
 */
export type Action = {
  /** The id of the action. This is distinct from the operation id. */
  id: string;

  /** The name of the action. */
  type: string;

  /** The timestamp of the action. */
  timestampUtcMs: string;

  /** The payload of the action. */
  input: unknown;

  /** The scope of the action */
  scope: string;

  /**
   * The attachments included in the action.
   *
   * This will be refactored in a future release.
   */
  attachments?: AttachmentInput[];

  /** The context of the action. */
  context?: ActionContext;
};

/**
 * The attributes stored for a file. Namely, attachments of a document.
 */
export type Attachment = {
  /** The binary data of the attachment in Base64 */
  data: string;

  /** The MIME type of the attachment */
  mimeType: string;

  // The extension of the attachment.
  extension?: string | null;

  // The file name of the attachment.
  fileName?: string | null;
};

export type AttachmentInput = Attachment & {
  hash: string;
};

export type ActionWithAttachment = Action & {
  attachments: AttachmentInput[];
};

/**
 * String type representing an attachment in a Document.
 *
 * @remarks
 * Attachment string is formatted as `attachment://<filename>`.
 */
export type AttachmentRef = string; // TODO `attachment://${string}`;
