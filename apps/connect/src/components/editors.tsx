import {
    DocumentToolbar,
    FILE,
    RevisionHistory,
} from '@powerhousedao/design-system';
import {
    Action,
    ActionErrorCallback,
    BaseAction,
    Document,
    EditorContext,
    Operation,
    actions,
} from 'document-model/document';
import { useAtomValue } from 'jotai';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useConnectCrypto, useConnectDid } from 'src/hooks/useConnectCrypto';
import { TUiNodes } from 'src/hooks/useUiNodes';
import { useUndoRedoShortcuts } from 'src/hooks/useUndoRedoShortcuts';
import { useUserPermissions } from 'src/hooks/useUserPermissions';
import { logger } from 'src/services/logger';
import { useGetDocumentModel } from 'src/store/document-model';
import { useGetEditor } from 'src/store/editor';
import { themeAtom } from 'src/store/theme';
import { useUser } from 'src/store/user';
import {
    DocumentDispatchCallback,
    useDocumentDispatch,
} from 'src/utils/document-model';
import { addActionContext, signOperation } from 'src/utils/signature';
import Button from './button';
import { EditorLoader } from './editor-loader';

export type EditorProps<
    T = unknown,
    A extends Action = Action,
    LocalState = unknown,
> = TUiNodes & {
    document: Document<T, A, LocalState> | undefined;
    onExport: () => void;
    onAddOperation: (operation: Operation) => Promise<void>;
    onOpenSwitchboardLink?: () => Promise<void>;
    onChange?: (document: Document<T, A, LocalState>) => void;
};

function EditorError({ message }: { message: string }) {
    return (
        <div className="flex size-full items-center justify-center">
            <h3 className="text-lg font-semibold">{message}</h3>
        </div>
    );
}

export function DocumentEditor(props: EditorProps) {
    const {
        selectedNode,
        fileNodeDocument,
        selectedParentNode,
        document: initialDocument,
        setSelectedNode,
        onChange,
        onExport,
        onAddOperation,
        onOpenSwitchboardLink,
    } = props;
    const [showRevisionHistory, setShowRevisionHistory] = useState(false);
    const theme = useAtomValue(themeAtom);
    const user = useUser() || undefined;
    const connectDid = useConnectDid();
    const { sign } = useConnectCrypto();
    const getDocumentModel = useGetDocumentModel();
    const getEditor = useGetEditor();

    const documentType = fileNodeDocument?.documentType;
    const documentModel = useMemo(
        () => (documentType ? getDocumentModel(documentType) : undefined),
        [documentType, getDocumentModel],
    );

    const editor = useMemo(
        () => (documentType ? getEditor(documentType) : undefined),
        [documentType, getEditor],
    );

    const [document, _dispatch, error] = useDocumentDispatch(
        documentModel?.reducer,
        initialDocument,
    );
    const context: EditorContext = useMemo(
        () => ({ theme, user }),
        [theme, user],
    );
    const userPermissions = useUserPermissions();

    const isLoadingDocument =
        fileNodeDocument?.status === 'LOADING' || !document;
    const isLoadingEditor =
        editor === undefined ||
        (!!document &&
            editor &&
            !editor.documentTypes.includes(document.documentType) &&
            !editor.documentTypes.includes('*'));

    const canUndo =
        !!document &&
        (document.revision.global > 0 || document.revision.local > 0);
    const canRedo = !!document?.clipboard.length;
    useUndoRedoShortcuts({ undo, redo, canUndo, canRedo });

    function dispatch(
        action: BaseAction | Action,
        onErrorCallback?: ActionErrorCallback,
    ) {
        const callback: DocumentDispatchCallback<unknown, Action, unknown> = (
            operation,
            state,
        ) => {
            if (!selectedNode) return;

            const { prevState } = state;

            signOperation(
                operation,
                sign,
                selectedNode.id,
                prevState,
                documentModel?.reducer,
                user,
            )
                .then(op => {
                    window.documentEditorDebugTools?.pushOperation(operation);
                    return onAddOperation(op);
                })
                .catch(logger.error);
        };

        _dispatch(
            addActionContext(action, connectDid, user),
            callback,
            onErrorCallback,
        );
    }

    useEffect(() => {
        return () => {
            window.documentEditorDebugTools?.clear();
        };
    }, []);

    useEffect(() => {
        if (!document) return;
        window.documentEditorDebugTools?.setDocument(document);
        onChange?.(document);
    }, [document]);

    function undo() {
        dispatch(actions.undo());
    }

    function redo() {
        dispatch(actions.redo());
    }

    function onClose() {
        setSelectedNode(selectedParentNode);
    }

    if (fileNodeDocument?.status === 'ERROR') {
        return <EditorError message={'Error loading document'} />;
    }

    if (isLoadingDocument || isLoadingEditor) {
        const message = isLoadingDocument
            ? 'Loading document'
            : 'Loading editor';
        return <EditorLoader message={message} />;
    }

    if (selectedNode?.kind !== FILE) {
        return null;
    }

    if (!documentModel) {
        return (
            <EditorError
                message={`Document of type '${documentType}' is not supported`}
            />
        );
    }

    if (editor === null) {
        return (
            <EditorError
                message={`No editor available for document of type '${documentType}'`}
            />
        );
    }

    const EditorComponent = editor.Component;
    const {
        disableExternalControls,
        documentToolbarEnabled,
        showSwitchboardLink,
    } = editor.config || {};

    return (
        <div className="relative h-full" id="document-editor-context">
            {documentToolbarEnabled &&
                disableExternalControls &&
                !showRevisionHistory && (
                    <DocumentToolbar
                        onClose={onClose}
                        onExport={onExport}
                        onShowRevisionHistory={() =>
                            setShowRevisionHistory(true)
                        }
                        title={document.name}
                        {...(showSwitchboardLink && {
                            onSwitchboardLinkClick: onOpenSwitchboardLink,
                        })}
                    />
                )}
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
            {showRevisionHistory ? (
                <RevisionHistory
                    documentTitle={document.name}
                    documentId={selectedNode.id}
                    globalOperations={document.operations.global}
                    localOperations={document.operations.local}
                    onClose={() => setShowRevisionHistory(false)}
                />
            ) : (
                <Suspense fallback={<EditorLoader />}>
                    <EditorComponent
                        error={error}
                        context={context}
                        document={document}
                        documentNodeName={selectedNode.name}
                        dispatch={dispatch}
                        onClose={onClose}
                        onExport={onExport}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        undo={undo}
                        redo={redo}
                        onSwitchboardLinkClick={onOpenSwitchboardLink}
                        onShowRevisionHistory={() =>
                            setShowRevisionHistory(true)
                        }
                        isAllowedToCreateDocuments={
                            userPermissions?.isAllowedToCreateDocuments ?? false
                        }
                        isAllowedToEditDocuments={
                            userPermissions?.isAllowedToEditDocuments ?? false
                        }
                    />
                </Suspense>
            )}
        </div>
    );
}
