import { logger } from "document-drive";
import type { Action, PHDocument } from "document-model";
import { queueActions } from "./queue.js";
import { makeSignedActionsWithContext } from "./sign.js";

async function getDocument(
  documentId: string,
): Promise<PHDocument | undefined> {
  try {
    return await window.ph?.reactor?.getDocument(documentId);
  } catch (error) {
    logger.debug(`Failed to get document with id ${documentId}:`, error);
    return undefined;
  }
}

export async function dispatchActions<TDocument = PHDocument, TAction = Action>(
  actionOrActions: TAction[] | TAction | undefined,
  document: TDocument | undefined,
): Promise<PHDocument | undefined>;
export async function dispatchActions(
  actionOrActions: Action[] | Action | undefined,

  documentId: string,
): Promise<PHDocument | undefined>;
export async function dispatchActions(
  actionOrActions: Action[] | Action | undefined,
  documentOrDocumentId: PHDocument | string | undefined,
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
  return result;
}
