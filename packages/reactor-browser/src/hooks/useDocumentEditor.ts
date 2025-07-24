import { type IDocumentDriveServer } from "document-drive";
import {
  type ActionErrorCallback,
  type ActionFromDocument,
  type DocumentModelModule,
  type OperationFromDocument,
  type PHDocument,
} from "document-model";
import { type DID, type IConnectCrypto } from "../crypto/index.js";
import { type User } from "../renown/types.js";
import { addActionContext, signOperation } from "../utils/signature.js";
import { useAddDebouncedOperations } from "./useAddDebouncedOperations.js";
import { useConnectCrypto, useConnectDid } from "./useConnectCrypto.js";
import { useDocumentDispatch } from "./useDocumentDispatch.js";

export type DocumentDispatchCallback<TDocument extends PHDocument> = (
  operation: OperationFromDocument<TDocument>,
  state: {
    prevState: TDocument;
    newState: TDocument;
  },
) => void;

export type UseDocumentEditorProps<TDocument extends PHDocument> = {
  driveId: string | undefined;
  nodeId: string | undefined;
  document: TDocument | undefined;
  documentModelModule: DocumentModelModule<TDocument> | undefined;
  user?: User;
  onExport?: () => void;
  onOpenSwitchboardLink?: () => Promise<void>;
  onChange?: (document: TDocument) => void;
};

export function useDocumentEditorProps<TDocument extends PHDocument>(
  reactor: IDocumentDriveServer | undefined,
  props: UseDocumentEditorProps<TDocument> & {
    connectDid?: DID;
    sign: IConnectCrypto["sign"];
  },
) {
  const {
    nodeId,
    driveId,
    documentModelModule,
    document: initialDocument,
    user,
    connectDid,
    sign,
  } = props;

  const addDebouncedOprations = useAddDebouncedOperations(reactor, {
    driveId,
    documentId: nodeId,
  });

  const [document, _dispatch, error] = useDocumentDispatch(
    documentModelModule?.reducer,
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

      if (!nodeId) {
        throw new Error("Node id is not set");
      }

      signOperation<TDocument>(
        operation,
        sign,
        nodeId,
        prevState,
        documentModelModule?.reducer,
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

export function useDocumentEditor<TDocument extends PHDocument>(
  reactor: IDocumentDriveServer | undefined,
  props: UseDocumentEditorProps<TDocument>,
) {
  const connectDid = useConnectDid();
  const { sign } = useConnectCrypto();

  const documentEditorDispatch = useDocumentEditorProps(reactor, {
    ...props,
    connectDid,
    sign,
  });

  return documentEditorDispatch;
}
