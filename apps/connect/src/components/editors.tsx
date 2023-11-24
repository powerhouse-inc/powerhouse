import { Action, Document, actions } from 'document-model/document';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { themeAtom } from 'src/store';
import { useDocumentModel } from 'src/store/document-model';
import { useEditor } from 'src/store/editor';
import { useDocumentReducer } from 'src/utils/document-model';
import Button from './button';

export interface EditorProps<T = unknown, A extends Action = Action> {
    document: Document<T, A>;
    onChange?: (document: Document<T, A>) => void;
}

export type EditorComponent<T = unknown, A extends Action = Action> = (
    props: EditorProps<T, A>
) => JSX.Element;

export interface IProps extends EditorProps {
    onSave: () => void;
    onClose: () => void;
    onExport: () => void;
}

export const DocumentEditor: React.FC<IProps> = ({
    document: initialDocument,
    onChange,
    onSave,
    onClose,
    onExport,
}) => {
    const documentModel = useDocumentModel(initialDocument.documentType);
    const editor = useEditor(initialDocument.documentType);
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
    const theme = useAtomValue(themeAtom);
    const [document, dispatch] = useDocumentReducer(
        documentModel.reducer,
        initialDocument
    );

    useEffect(() => {
        onChange?.(document);
    }, [document]);

    const operations = document ? [...document.operations].reverse() : [];

    function undo() {
        dispatch(actions.undo());
    }

    function redo() {
        dispatch(actions.redo());
    }

    const canUndo = document && document.revision > 0;
    const canRedo = document && document.revision < document.operations.length;

    return (
        <div className="relative h-full">
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
                    <Button onClick={onSave}>Save</Button>
                    <Button onClick={onClose}>Close</Button>
                </div>
            </div>
            <EditorComponent
                editorContext={{ theme }}
                document={document}
                dispatch={dispatch}
            />
        </div>
    );
};
