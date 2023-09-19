import {
    Action,
    BaseAction,
    Document,
    DocumentModel,
    Editor,
    actions,
} from 'document-model/document';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { themeAtom } from 'src/store';
import { useDocumentReducer } from 'src/utils/document-model';

export interface EditorProps<T = unknown, A extends Action = Action> {
    document?: Document<T, A | BaseAction>;
    onChange?: (document: Document<T, A | BaseAction>) => void;
}

export type EditorComponent<T = unknown, A extends Action = Action> = (
    props: EditorProps<T, A>
) => JSX.Element;

export function wrapEditor<T, A extends Action>(
    documentModel: DocumentModel<T, A>,
    editor: Editor<T, A>
) {
    const EditorComponent = editor.Component;
    return ({ document: initialDocument, onChange }: EditorProps<T, A>) => {
        const theme = useAtomValue(themeAtom);
        const [document, dispatch] = useDocumentReducer(
            documentModel.reducer,
            documentModel.utils.createDocument(initialDocument)
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
        const canRedo =
            document && document.revision < document.operations.length;

        return (
            <div className="relative h-full">
                <EditorComponent
                    editorContext={{ theme }}
                    document={document}
                    dispatch={dispatch}
                />
            </div>
        );
    };
}
