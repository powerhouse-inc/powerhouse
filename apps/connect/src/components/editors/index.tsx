import {
    Action,
    BaseAction,
    Document,
} from '@acaldas/document-model-libs/browser/document';

export interface EditorProps<T = unknown, A extends Action = Action> {
    document?: Document<T, A | BaseAction>;
    onChange?: (scope: Document<T, A | BaseAction>) => void;
}

export type EditorComponent<T = unknown, A extends Action = Action> = (
    props: EditorProps<T, A>
) => JSX.Element;
