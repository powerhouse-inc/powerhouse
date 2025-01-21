import type { ExtendedEditor } from 'document-model-libs';
import { atom, useAtomValue } from 'jotai';
import { unwrap } from 'jotai/utils';
import { useDefaultDocumentModelEditor } from 'src/hooks/useDefaultDocumentModelEditor';
import { ExternalProjectModule, loadPackages } from './document-model';

export const LOCAL_DOCUMENT_EDITORS = import.meta.env.LOCAL_DOCUMENT_EDITORS;
const LOAD_EXTERNAL_PROJECTS = import.meta.env.LOAD_EXTERNAL_PROJECTS;

async function loadEditors() {
    const baseEditorsModules = (await import(
        'document-model-libs/editors'
    )) as Record<string, ExtendedEditor>;
    let baseEditors = Object.values(baseEditorsModules);

    if (LOAD_EXTERNAL_PROJECTS === 'true') {
        const externalEditors = (await loadPackages())
            .filter(module => !!module.documentModels)
            .map(module => (module as Required<ExternalProjectModule>).editors)
            .reduce((acc, val) => acc.concat(val), []);

        baseEditors = baseEditors.concat(externalEditors);
    }

    if (!LOCAL_DOCUMENT_EDITORS) {
        return baseEditors;
    }

    try {
        const localEditors = (await import(
            'LOCAL_DOCUMENT_EDITORS'
        )) as unknown as Record<string, ExtendedEditor>;
        console.log('Loaded local document editors:', localEditors);

        return Object.values(localEditors).concat(baseEditors);
    } catch (e) {
        console.error('Error loading local document models', e);
        return baseEditors;
    }
}

const editorsPromise = loadEditors();

const editorsAtom = atom<Promise<ExtendedEditor[]>>(editorsPromise);
const unwrappedEditorsAtom = unwrap(editorsAtom);

// suspends the UI while editors are loading
export const useEditors = () => {
    return useAtomValue(editorsAtom);
};

// will return undefined until editors are initialized. Does not block rendering.
export const useUnwrappedEditors = () => {
    return useAtomValue(unwrappedEditorsAtom);
};

export const useEditorsAsync = () => editorsPromise;

const getEditor = (
    documentType: string,
    editors: ExtendedEditor[],
    preferredEditorId?: string,
) => {
    const preferredEditor = editors.find(
        e =>
            e.config?.id === preferredEditorId &&
            e.documentTypes.includes(documentType),
    );

    if (preferredEditor) return preferredEditor;

    const editor =
        editors.find(e => e.documentTypes.includes(documentType)) ||
        editors.find(e => e.documentTypes.includes('*'));

    return editor || null;
};

export const useEditor = (documentType: string) => {
    const editors = useUnwrappedEditors();
    if (!editors) {
        return undefined;
    }
    return getEditor(documentType, editors);
};

export const useGetEditor = () => {
    const editors = useUnwrappedEditors();
    const [defaultDocumentModelEditor] = useDefaultDocumentModelEditor();

    return (documentType: string) =>
        editors
            ? getEditor(documentType, editors, defaultDocumentModelEditor.value)
            : undefined;
};

export const usePreloadEditor = () => {
    const editorsPromise = useEditorsAsync();
    return async (documentType: string) => {
        const editors = await editorsPromise;
        const editor = getEditor(documentType, editors);
        if (editor && 'preload' in editor.Component) {
            await (
                editor.Component as { preload: () => Promise<void> }
            ).preload();
        }
    };
};
