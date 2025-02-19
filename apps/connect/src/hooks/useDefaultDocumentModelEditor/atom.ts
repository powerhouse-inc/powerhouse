import { atomWithStorage } from '#store/utils';

export const DEFAULT_DOCUMENT_MODL_EDITOR = 'defaultDocumentModelEditor';

export type DefaultDocumentModelEditor =
    | { label: 'V1'; value: 'document-model-editor' }
    | { label: 'V2'; value: 'document-model-editor-v2' };

export const defaultDocumentModelEditorAtom =
    atomWithStorage<DefaultDocumentModelEditor>(DEFAULT_DOCUMENT_MODL_EDITOR, {
        label: 'V2',
        value: 'document-model-editor-v2',
    });
