import { getPHStore } from "../hooks/ph-store.js";
import type { PagingOptions } from "@powerhousedao/reactor";
import type {
  Action,
  DocumentOperations,
  Operation,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { logger } from "document-model";
import { OperationRejectedError } from "../errors.js";
import { queueActions } from "./queue.js";
import { makeSignedActionsWithContext } from "./sign.js";

async function getDocument(
  documentId: string,
): Promise<PHDocument | undefined> {
  try {
    return await getPHStore()?.reactorClient?.get(documentId);
  } catch (error) {
    logger.debug(`Failed to get document with id ${documentId}:`, error);
    return undefined;
  }
}

async function getOperationsSince(
  documentId: string,
  scope: string,
  sinceRevision: number,
): Promise<Operation[]> {
  const reactorClient = getPHStore()?.reactorClient;
  if (!reactorClient) {
    return [];
  }
  const operations: Operation[] = [];
  let paging: PagingOptions | undefined;
  do {
    const page = await reactorClient.getOperations(
      documentId,
      { branch: "main", scopes: [scope] },
      { sinceRevision },
      paging,
    );
    operations.push(...page.results);
    paging =
      page.nextCursor && page.results.length
        ? { cursor: page.nextCursor, limit: page.options.limit }
        : undefined;
  } while (paging);
  return operations;
}

/** The operations the dispatch produced in `scope`: a remote client returns them on the
 * document, the local clients do not, so they are read from the revision before it. */
async function getDispatchedOperations(
  before: PHDocument,
  result: PHDocument,
  scope: string,
  actionIds: Set<string>,
): Promise<readonly Operation[]> {
  const returned = (result.operations as DocumentOperations | undefined)?.[
    scope
  ];
  if (returned?.some((op) => actionIds.has(op.action.id))) {
    return returned;
  }
  return getOperationsSince(
    result.header.id,
    scope,
    before.header.revision[scope] ?? 0,
  );
}

async function getActionErrors(
  before: PHDocument,
  result: PHDocument,
  actions: Action[],
): Promise<OperationRejectedError[]> {
  const actionIds = new Set(actions.map((action) => action.id));
  const errors: OperationRejectedError[] = [];
  for (const scope of new Set(actions.map((action) => action.scope))) {
    let operations: readonly Operation[];
    try {
      operations = await getDispatchedOperations(
        before,
        result,
        scope,
        actionIds,
      );
    } catch (error) {
      logger.warn(
        "Could not read the dispatched operations of @scope: @error",
        scope,
        error,
      );
      continue;
    }
    for (const action of actions) {
      if (action.scope !== scope) continue;
      const operation = operations.findLast((op) => op.action.id === action.id);
      const error =
        operation &&
        OperationRejectedError.fromOperation(
          result.header.id,
          scope,
          operation,
        );
      if (error) {
        errors.push(error);
      }
    }
  }
  return errors;
}

/**
 * Dispatches actions to a document.
 * @param actionOrActions - The action or actions to dispatch.
 * @param document - The document to dispatch actions to.
 * @param onErrors - Callback invoked with an `OperationRejectedError` for each action the
 * document did not apply, or with why nothing was dispatched.
 * @returns The updated document, or undefined if the dispatch failed.
 */
export async function dispatchActions<TDocument = PHDocument, TAction = Action>(
  actionOrActions: TAction[] | TAction | undefined,
  document: TDocument | undefined,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: (result: PHDocument) => void,
): Promise<PHDocument | undefined>;
/**
 * Dispatches actions to a document.
 * @param actionOrActions - The action or actions to dispatch.
 * @param documentId - The ID of the document to dispatch actions to.
 * @param onErrors - Callback invoked with an `OperationRejectedError` for each action the
 * document did not apply.
 * @returns The updated document, or undefined if the dispatch failed.
 */
export async function dispatchActions(
  actionOrActions: Action[] | Action | undefined,
  documentId: string,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: (result: PHDocument) => void,
): Promise<PHDocument | undefined>;
export async function dispatchActions(
  actionOrActions: Action[] | Action | undefined,
  documentOrDocumentId: PHDocument | string | undefined,
  onErrors?: (errors: Error[]) => void,
  onSuccess?: (result: PHDocument) => void,
): Promise<PHDocument | undefined> {
  const document =
    typeof documentOrDocumentId === "string"
      ? await getDocument(documentOrDocumentId)
      : documentOrDocumentId;

  if (!document) {
    const message = `Document with id ${JSON.stringify(documentOrDocumentId)} not found`;
    logger.error(message);
    onErrors?.([new Error(message)]);
    return;
  }

  const signedActionsWithContext = makeSignedActionsWithContext(
    actionOrActions,
    document,
  );
  if (!signedActionsWithContext) {
    const message = "No signed actions with context found";
    logger.error(message);
    onErrors?.([new Error(message)]);
    return;
  }
  const result = await queueActions(document, signedActionsWithContext);

  if (onErrors && result) {
    const errors = await getActionErrors(
      document,
      result,
      signedActionsWithContext,
    );
    if (errors.length) {
      onErrors(errors);
    }
  }

  if (onSuccess && result) {
    onSuccess(result);
  }

  return result;
}
