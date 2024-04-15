import {
    Action,
    ActionErrorCallback,
    ActionSigner,
    BaseAction,
    Document,
    EditorContext,
    Operation,
    actions,
} from 'document-model/document';
import { useAtomValue } from 'jotai';
import { useEffect, useMemo } from 'react';
import { useConnectDid } from 'src/hooks/useConnectCrypto';
import { useUndoRedoShortcuts } from 'src/hooks/useUndoRedoShortcuts';
import { useDocumentModel } from 'src/store/document-model';
import { useEditor } from 'src/store/editor';
import { themeAtom } from 'src/store/theme';
import { useUser } from 'src/store/user';
import { useDocumentDispatch } from 'src/utils/document-model';
import Button from './button';

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
    onClose: () => void;
    onExport: () => void;
    onAddOperation: (operation: Operation) => Promise<void>;
    onOpenSwitchboardLink?: () => Promise<void>;
}

export const DocumentEditor: React.FC<IProps> = ({
    document: initialDocument,
    onChange,
    onClose,
    onExport,
    onAddOperation,
    onOpenSwitchboardLink,
}) => {
    const user = useUser();
    const connectDid = useConnectDid();
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

    function addActionContext(action: Action): Action {
        if (!user) return action;
        const signer: ActionSigner = {
            app: {
                name: 'Connect',
                key: connectDid || '',
            },
            user: {
                address: user.address,
                chainId: user.chainId,
            },
            signature: '',
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
        _dispatch(
            addActionContext(action),
            operation => {
                window.documentEditorDebugTools?.pushOperation(operation);
                onAddOperation(operation).catch(console.error);
            },
            onErrorCallback,
        );
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
            <EditorComponent
                error={error}
                context={context}
                document={document}
                dispatch={dispatch}
                onClose={onClose}
                onExport={onExport}
                onSwitchboardLinkClick={onOpenSwitchboardLink}
            />
        </div>
    );
};
