import { Document } from '@acaldas/document-model-libs/document';

export interface EditorProps<T = unknown> {
    document?: Document<T>;
    onChange?: (scope: Document<T>) => void;
}

export type EditorComponent<T = unknown> = (
    props: EditorProps<T>
) => JSX.Element;
