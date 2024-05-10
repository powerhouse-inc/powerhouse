import type { ExtendedEditor } from 'document-model-libs';
import { atom, useAtomValue } from 'jotai';
import { unwrap } from 'jotai/utils';

async function loadEditors() {
    const Editors = await import('document-model-libs/editors');
    return [...Object.values(Editors)] as ExtendedEditor[];
}

const editorsAtom = atom<Promise<ExtendedEditor[]>>(loadEditors);
const unwrappedEditorsAtom = unwrap(editorsAtom, prev => prev ?? []);

// return empty array until editors are done loading
export const useEditors = () => {
    return useAtomValue(unwrappedEditorsAtom);
};

// suspends the UI while editors are loading
export const useEditorsAsync = () => {
    return useAtomValue(editorsAtom);
};

const getEditor = (documentType: string, editors: ExtendedEditor[]) =>
    editors.find(e => e.documentTypes.includes(documentType)) ||
    editors.find(e => e.documentTypes.includes('*'));

export const useEditor = (documentType: string) => {
    const editors = useEditorsAsync();
    return getEditor(documentType, editors);
};

export const useGetEditor = () => {
    const editors = useEditors();
    return (documentType: string) => getEditor(documentType, editors);
};

export const usePreloadEditor = () => {
    const getEditor = useGetEditor();
    return async (documentType: string) => {
        const editor = getEditor(documentType);
        if (editor && 'preload' in editor.Component) {
            await (
                editor.Component as { preload: () => Promise<void> }
            ).preload();
        }
    };
};
