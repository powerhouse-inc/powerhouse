import { ZodError } from "zod";
import {
  ab2hex,
  buildOperationSignatureMessage,
  buildOperationSignatureParams,
  generateId,
  hex2ab,
} from "./crypto.js";
import {
  InvalidActionInputError,
  InvalidActionInputZodError,
} from "./errors.js";
import {
  LoadStateActionInputSchema,
  PruneActionInputSchema,
  RedoActionInputSchema,
  SetNameActionInputSchema,
  UndoActionInputSchema,
} from "./schemas.js";
import type {
  Action,
  ActionContext,
  ActionSignatureContext,
  ActionSigner,
  ActionSigningHandler,
  ActionVerificationHandler,
  AppActionSigner,
  LoadStateAction,
  NOOPAction,
  Operation,
  PHBaseState,
  PHDocument,
  RedoAction,
  Reducer,
  SchemaPruneAction,
  SetNameAction,
  Signature,
  UndoAction,
  UserActionSigner,
} from "./types.js";

/**
 * Changes the name of the document.
 *
 * @param name - The name to be set in the document.
 * @category Actions
 */
export const setName = (name: string) =>
  createAction<SetNameAction>(
    "SET_NAME",
    name,
    undefined,
    SetNameActionInputSchema,
    "global",
  );

/**
 * Cancels the last `count` operations.
 *
 * @param count - Number of operations to cancel
 * @category Actions
 */
export const undo = (skip = 1, scope = "global") =>
  createAction<UndoAction>(
    "UNDO",
    skip,
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
    count,
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
  createAction<NOOPAction>("NOOP", undefined, undefined, undefined, scope);

export const actions = {
  setName,
  undo,
  redo,
  prune,
  loadState,
  noop,
} as unknown as Record<string, (input: any) => Action>;
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
): Operation => {
  return {
    ...action,
    action,
    id: generateId(),
    timestampUtcMs: new Date().toISOString(),
    hash: "",
    error: undefined,

    index,
    skip,
  };
};

export const operationFromOperation = (
  operation: Operation,
  skip: number,
): Operation => {
  return {
    ...operation,
    hash: "",
    error: undefined,
    skip,
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
  const operation = result.operations[action.scope].at(-1);
  if (!operation) {
    throw new Error("Action was not applied");
  }

  const previousStateHash = result.operations[action.scope].at(-2)?.hash ?? "";
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
