import {
    Action,
    ActionErrorCallback,
    BaseAction,
    Document,
    Operation,
    actions,
} from 'document-model/document';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { useUndoRedoShortcuts } from 'src/hooks/useUndoRedoShortcuts';
import { useDocumentModel } from 'src/store/document-model';
import { useEditor } from 'src/store/editor';
import { themeAtom } from 'src/store/theme';
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
    const documentModel = useDocumentModel(initialDocument.documentType);
    const editor = useEditor(initialDocument.documentType);
    const theme = useAtomValue(themeAtom);
    const [document, _dispatch, error] = useDocumentDispatch(
        documentModel?.reducer,
        initialDocument,
    );

    function dispatch(
        action: BaseAction | Action,
        onErrorCallback?: ActionErrorCallback,
    ) {
        _dispatch(
            action,
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

    const operations = document
        ? [...document.operations.global].reverse()
        : [];

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
        <div className="relative h-full">
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
                editorContext={{ theme }}
                document={document}
                dispatch={dispatch}
                onClose={onClose}
                onExport={onExport}
                onSwitchboardLinkClick={onOpenSwitchboardLink}
            />
        </div>
    );
};
