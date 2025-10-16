import type { Action, DocumentAction } from "document-model";

export type DocumentDispatch<TAction extends Action> = (
  actionOrActions:
    | TAction
    | TAction[]
    | DocumentAction
    | DocumentAction[]
    | undefined,
) => void;
