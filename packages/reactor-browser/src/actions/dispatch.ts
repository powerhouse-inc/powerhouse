import { logger } from "document-drive";
import { type Action, type PHDocument } from "document-model";
import { queueActions } from "./queue.js";
import { makeSignedActionsWithContext } from "./sign.js";

export async function dispatchActions(
  actionOrActions: Action[] | Action | undefined,
  document: PHDocument | undefined,
) {
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
