import { dispatchActions } from "@powerhousedao/reactor-browser";
import { logger } from "document-drive";
import type { Action, PHDocument } from "document-model";

export function useDispatch(document: PHDocument | undefined) {
  function dispatch(actionOrActions: Action[] | Action | undefined) {
    dispatchActions(actionOrActions, document).catch(logger.error);
  }
  return [document, dispatch] as const;
}
