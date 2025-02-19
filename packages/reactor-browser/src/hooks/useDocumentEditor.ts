import { IDocumentDriveServer } from "document-drive";
import {
  Action,
  ActionErrorCallback,
  CustomAction,
  DocumentModelModule,
  Operation,
  PHDocument,
} from "document-model";
import { User } from "../renown/types";
import { addActionContext, signOperation } from "../utils/signature";
import { useAddDebouncedOperations } from "./useAddDebouncedOperations";
import { useConnectCrypto, useConnectDid } from "./useConnectCrypto";
import { useDocumentDispatch } from "./useDocumentDispatch";

export type DocumentDispatchCallback<TGlobalState, TLocalState> = (
  operation: Operation,
  state: {
    prevState: PHDocument<TGlobalState, TLocalState>;
    newState: PHDocument<TGlobalState, TLocalState>;
  },
) => void;

export type UseDocumentEditorProps<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
> = {
  driveId: string;
  nodeId: string;
  document: PHDocument<TGlobalState, TLocalState> | undefined;
  documentModel: DocumentModelModule<TGlobalState, TLocalState, TCustomAction>;
  user?: User;
  onExport?: () => void;
  onOpenSwitchboardLink?: () => Promise<void>;
  onChange?: (document: PHDocument<TGlobalState, TLocalState>) => void;
};

export function useDocumentEditor<
  TGlobalState,
  TLocalState,
  TCustomAction extends CustomAction = never,
>(
  reactor: IDocumentDriveServer | undefined,
  props: UseDocumentEditorProps<TGlobalState, TLocalState, TCustomAction>,
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
    action: TCustomAction | Action,
    onErrorCallback?: ActionErrorCallback,
  ) {
    const callback: DocumentDispatchCallback<TGlobalState, TLocalState> = (
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
