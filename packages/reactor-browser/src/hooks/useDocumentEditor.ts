import { IDocumentDriveServer } from "document-drive";
import {
  ActionErrorCallback,
  ActionFromDocument,
  DocumentModelModule,
  OperationFromDocument,
  PHDocument,
} from "document-model";
import { User } from "../renown/types";
import { addActionContext, signOperation } from "../utils/signature";
import { useAddDebouncedOperations } from "./useAddDebouncedOperations";
import { useConnectCrypto, useConnectDid } from "./useConnectCrypto";
import { useDocumentDispatch } from "./useDocumentDispatch";

export type DocumentDispatchCallback<TDocument extends PHDocument> = (
  operation: OperationFromDocument<TDocument>,
  state: {
    prevState: TDocument;
    newState: TDocument;
  },
) => void;

export type UseDocumentEditorProps<TDocument extends PHDocument> = {
  driveId: string;
  nodeId: string;
  document: TDocument | undefined;
  documentModelModule: DocumentModelModule<TDocument>;
  user?: User;
  onExport?: () => void;
  onOpenSwitchboardLink?: () => Promise<void>;
  onChange?: (document: TDocument) => void;
};

export function useDocumentEditor<TDocument extends PHDocument>(
  reactor: IDocumentDriveServer | undefined,
  props: UseDocumentEditorProps<TDocument>,
) {
  const {
    nodeId,
    driveId,
    documentModelModule,
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
    documentModelModule.reducer,
    initialDocument,
  );

  function dispatch(
    action: ActionFromDocument<TDocument>,
    onErrorCallback?: ActionErrorCallback,
  ) {
    const callback: DocumentDispatchCallback<TDocument> = (
      operation,
      state,
    ) => {
      const { prevState } = state;

      signOperation<TDocument>(
        operation,
        sign,
        nodeId,
        prevState,
        documentModelModule.reducer,
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
