import type { ExtendedEditor } from 'document-model-libs';
import { atom, useAtomValue } from 'jotai';


async function loadEditors() {
    const Editors = await import('document-model-libs/editors');
    return [...Object.values(Editors)] as ExtendedEditor[];
}

const editorsAtom = atom(async () => loadEditors());
// const loadableAtom = loadable(asyncAtom)

// export const editorsAtom = atomWithLazy(loadEditors);
export const useEditors = () => useAtomValue(editorsAtom);

const getEditor = (documentType: string, editors: ExtendedEditor[]) =>
    editors.find(e => e.documentTypes.includes(documentType)) ||
    editors.find(e => e.documentTypes.includes('*'));

export const useEditor = (documentType: string) => {
    const editors = useEditors();
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
            return editor.Component.preload();
        }
    };

}