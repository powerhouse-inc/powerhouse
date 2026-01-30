import { logger } from "document-drive";
import type { Action, PHDocument } from "document-model";
import { queueActions } from "./queue.js";
import { makeSignedActionsWithContext } from "./sign.js";

async function getDocument(
  documentId: string,
): Promise<PHDocument | undefined> {
  try {
    return await window.ph?.legacyReactor?.getDocument(documentId);
  } catch (error) {
    logger.debug(`Failed to get document with id ${documentId}:`, error);
    return undefined;
  }
}

function getActionErrors(result: PHDocument, actions: Action[]) {
  return actions.reduce((errors, a) => {
    const scopeOperations = result.operations[a.scope];
    if (!scopeOperations) {
      return errors;
    }
    const op = scopeOperations.findLast((op) => op.action.id === a.id);

    if (op?.error) {
      errors.push(new Error(op.error));
    }
    return errors;
  }, new Array<Error>());
}

/**
 * Dispatches actions to a document.
 * @param actionOrActions - The action or actions to dispatch.
 * @param document - The document to dispatch actions to.
 * @param onErrors - Callback invoked with any errors that occurred during action execution.
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
 * @param onErrors - Callback invoked with any errors that occurred during action execution.
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
    logger.error(
      `Document with id ${JSON.stringify(documentOrDocumentId)} not found`,
    );
    return;
  }

  const signedActionsWithContext = await makeSignedActionsWithContext(
    actionOrActions,
    document,
  );
  if (!signedActionsWithContext) {
    logger.error("No signed actions with context found");
    return;
  }
  const result = await queueActions(document, signedActionsWithContext);

  if (onErrors && result) {
    const errors = getActionErrors(result, signedActionsWithContext);
    if (errors.length) {
      onErrors(errors);
    }
  }

  if (onSuccess && result) {
    onSuccess(result);
  }

  return result;
}
