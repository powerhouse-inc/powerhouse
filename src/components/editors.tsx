import { RevisionHistory } from '@powerhousedao/design-system';
import {
    Action,
    ActionErrorCallback,
    ActionSigner,
    BaseAction,
    Document,
    EditorContext,
    Operation,
    OperationSignatureContext,
    Reducer,
    User,
    actions,
    utils,
} from 'document-model/document';
import { Action as HistoryAction } from 'history';
import { useAtomValue } from 'jotai';
import { useEffect, useMemo, useState } from 'react';
import { useConnectCrypto, useConnectDid } from 'src/hooks/useConnectCrypto';
import { useUndoRedoShortcuts } from 'src/hooks/useUndoRedoShortcuts';
import { useUserPermissions } from 'src/hooks/useUserPermissions';
import { useDocumentModel } from 'src/store/document-model';
import { useEditor } from 'src/store/editor';
import { themeAtom } from 'src/store/theme';
import { useUser } from 'src/store/user';
import {
    DocumentDispatchCallback,
    useDocumentDispatch,
} from 'src/utils/document-model';
import Button from './button';
import history from './history';

export interface EditorProps<
    T = unknown,
    A extends Action = Action,
    LocalState = unknown,
> {
    document: Document<T, A, LocalState>;
    onChange?: (document: Document<T, A, LocalState>) => void;
}

export type EditorComponent<
    T = unknown,
    A extends Action = Action,
    LocalState = unknown,
> = (props: EditorProps<T, A, LocalState>) => JSX.Element;

export interface IProps extends EditorProps {
    // todo: check that this is equivalent to the document ID
    fileNodeId: string;
    onClose: () => void;
    onExport: () => void;
    onAddOperation: (operation: Operation) => Promise<void>;
    onOpenSwitchboardLink?: () => Promise<void>;
    fileId: string;
}

const signOperation = async (
    operation: Operation,
    sign: (data: Uint8Array) => Promise<Uint8Array>,
    documentId: string,
    document: Document<unknown, Action>,
    reducer?: Reducer<unknown, Action, unknown>,
    user?: User,
) => {
    if (!user) return operation;
    if (!operation.context) return operation;
    if (!operation.context.signer) return operation;
    if (!reducer) {
        console.error('Document model does not have a reducer');
        return operation;
    }

    const context: Omit<
        OperationSignatureContext,
        'operation' | 'previousStateHash'
    > = {
        documentId,
        signer: operation.context.signer,
    };

    const signedOperation = await utils.buildSignedOperation(
        operation,
        reducer,
        document,
        context,
        sign,
    );

    return signedOperation;
};

export const DocumentEditor: React.FC<IProps> = ({
    fileNodeId,
    document: initialDocument,
    onChange,
    onClose,
    onExport,
    fileId,
    onAddOperation,
    onOpenSwitchboardLink,
}) => {
    const [showRevisionHistory, setShowRevisionHistory] = useState(false);
    const user = useUser();
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const documentModel = useDocumentModel(initialDocument.documentType);
    const editor = useEditor(initialDocument.documentType);
    const theme = useAtomValue(themeAtom);
    const [document, _dispatch, error] = useDocumentDispatch(
        documentModel?.reducer,
        initialDocument,
    );
    const context: EditorContext = useMemo(
        () => ({ theme, user }),
        [theme, user],
    );
    const { isAllowedToCreateDocuments, isAllowedToEditDocuments } =
        useUserPermissions();

    function addActionContext(action: Action): Action {
        if (!user) return action;
        const signer: ActionSigner = {
            app: {
                name: 'Connect',
                key: connectDid || '',
            },
            user: {
                address: user.address,
                networkId: user.networkId,
                chainId: user.chainId,
            },
            signatures: [],
        };

        return {
            ...action,
            context: {
                signer,
            },
        };
    }

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
                fileId,
                prevState,
                documentModel?.reducer,
                user,
            )
                .then(op => {
                    window.documentEditorDebugTools?.pushOperation(operation);
                    return onAddOperation(op);
                })
                .catch(console.error);
        };

        _dispatch(addActionContext(action), callback, onErrorCallback);
    }

    useEffect(() => {
        return () => {
            window.documentEditorDebugTools?.clear();
        };
    }, []);

    useEffect(() => {
        window.documentEditorDebugTools?.setDocument(document);
        onChange?.(document);
    }, [document]);

    useEffect(() => {
        history.listen(update => {
            if (update.action === HistoryAction.Pop) {
                onClose();
            }
        });
    }, [onClose]);

    function undo() {
        dispatch(actions.undo());
    }

    function redo() {
        dispatch(actions.redo());
    }

    const canUndo =
        document &&
        (document.revision.global > 0 || document.revision.local > 0);
    const canRedo = document.clipboard.length > 0;

    useUndoRedoShortcuts({ undo, redo, canUndo, canRedo });

    if (!documentModel) {
        return (
            <h3>
                Document of type {initialDocument.documentType} is not
                supported.
            </h3>
        );
    }

    if (!editor) {
        return (
            <h3>
                No editor available for document of type{' '}
                {initialDocument.documentType}
            </h3>
        );
    }

    const EditorComponent = editor.Component;
    const { disableExternalControls } = editor.config || {};

    return (
        <div className="relative h-full" id="document-editor-context">
            {!disableExternalControls && (
                <div className="mb-4 flex justify-end gap-10">
                    <Button onClick={onExport}>Export</Button>
                    <div className="flex gap-4">
                        <Button onClick={undo} disabled={!canUndo}>
                            Undo
                        </Button>
                        <Button onClick={redo} disabled={!canRedo}>
                            Redo
                        </Button>
                    </div>
                    <div className="flex gap-4">
                        <Button onClick={onClose}>Close</Button>
                    </div>
                </div>
            )}
            <>
                {showRevisionHistory ? (
                    <RevisionHistory
                        documentTitle={document.name}
                        documentId={fileNodeId}
                        globalOperations={document.operations.global}
                        localOperations={document.operations.local}
                        onClose={() => setShowRevisionHistory(false)}
                    />
                ) : (
                    <EditorComponent
                        error={error}
                        context={context}
                        document={document}
                        dispatch={dispatch}
                        onClose={onClose}
                        onExport={onExport}
                        onSwitchboardLinkClick={onOpenSwitchboardLink}
                        onShowRevisionHistory={() =>
                            setShowRevisionHistory(true)
                        }
                        isAllowedToCreateDocuments={isAllowedToCreateDocuments}
                        isAllowedToEditDocuments={isAllowedToEditDocuments}
                    />
                )}
            </>
        </div>
    );
};
