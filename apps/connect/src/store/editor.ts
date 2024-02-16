import { ExtendedEditor } from 'document-model-libs';
import * as Editors from 'document-model-libs/editors';
import { atom, useAtomValue } from 'jotai';

const editors = [...Object.values(Editors)] as ExtendedEditor[];

export const editorsAtom = atom(editors);
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
