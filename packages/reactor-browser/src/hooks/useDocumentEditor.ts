import { IDocumentDriveServer } from "document-drive";
import {
  Action,
  ActionErrorCallback,
  BaseAction,
  Document,
  DocumentModel,
  Operation,
} from "document-model";
import { User } from "../renown/types";
import { addActionContext, signOperation } from "../utils/signature";
import { useAddDebouncedOperations } from "./useAddDebouncedOperations";
import { useConnectCrypto, useConnectDid } from "./useConnectCrypto";
import { useDocumentDispatch } from "./useDocumentDispatch";

export type DocumentDispatchCallback<State, A extends Action, LocalState> = (
  operation: Operation,
  state: {
    prevState: Document<State, A, LocalState>;
    newState: Document<State, A, LocalState>;
  },
) => void;

export type UseDocumentEditorProps<
  T = unknown,
  A extends Action = Action,
  LocalState = unknown,
> = {
  driveId: string;
  nodeId: string;
  document: Document<T, A, LocalState> | undefined;
  documentModel: DocumentModel<unknown, Action>;
  user?: User;
  onExport?: () => void;
  onOpenSwitchboardLink?: () => Promise<void>;
  onChange?: (document: Document<T, A, LocalState>) => void;
};

export function useDocumentEditor(
  reactor: IDocumentDriveServer | undefined,
  props: UseDocumentEditorProps,
) {
  const {
    nodeId,
    driveId,
    documentModel,
    document: initialDocument,
    user,
  } = props;

  const connectDid = useConnectDid();
  const { sign } = useConnectCrypto();

  const addDebouncedOprations = useAddDebouncedOperations(reactor, {
    driveId,
    documentId: nodeId,
  });

  const [document, _dispatch, error] = useDocumentDispatch(
    documentModel.reducer,
    initialDocument,
  );

  function dispatch(
    action: BaseAction | Action,
    onErrorCallback?: ActionErrorCallback,
  ) {
    const callback: DocumentDispatchCallback<unknown, Action, unknown> = (
      operation,
      state,
    ) => {
      const { prevState } = state;

      signOperation(
        operation,
        sign,
        nodeId,
        prevState,
        documentModel.reducer,
        user,
      )
        .then((op) => {
          return addDebouncedOprations(op);
        })
        .catch(console.error);
    };

    _dispatch(
      addActionContext(action, connectDid, user),
      callback,
      onErrorCallback,
    );
  }

  return {
    dispatch,
    document,
    error,
  };
}
