import type { ExtendedEditor } from 'document-model-libs';
import { useAtomValue } from 'jotai';
import { atomWithLazy, loadable, unwrap } from 'jotai/utils';
import { useCallback, useEffect, useRef } from 'react';
import { useDefaultDocumentModelEditor } from 'src/hooks/useDefaultDocumentModelEditor';
import { DocumentModelsModule } from 'src/utils/types';
import { getExternalPackages } from './external-packages';

export const LOCAL_DOCUMENT_EDITORS = import.meta.env.LOCAL_DOCUMENT_EDITORS;

async function loadBaseEditors() {
    const JsonEditor = (await import('document-model-libs/editors/json'))
        .default as unknown as ExtendedEditor;
    return [JsonEditor as unknown as ExtendedEditor];
}

function getEditorsFromModules(modules: DocumentModelsModule[]) {
    return modules
        .map(module => module.editors)
        .reduce((acc, val) => acc.concat(val), []);
}

async function loadDynamicEditors() {
    if (!LOCAL_DOCUMENT_EDITORS) {
        return [];
    }
    try {
        const localEditors = (await import(
            'LOCAL_DOCUMENT_EDITORS'
        )) as unknown as Record<string, ExtendedEditor>;
        console.log('Loaded local document editors:', localEditors);
        return Object.values(localEditors);
    } catch (e) {
        console.error('Error loading local document editors', e);
        return [];
    }
}

let editors: ExtendedEditor[] | undefined = undefined;

async function loadEditors() {
    if (editors) {
        return editors;
    }

    const baseEditors = await loadBaseEditors();
    const dynamicEditors = await loadDynamicEditors();
    const externalModules = await getExternalPackages();
    const externalEditors = getEditorsFromModules(externalModules);

    editors = dynamicEditors.concat(externalEditors, baseEditors);
    return editors;
}

const editorsAtom = atomWithLazy(loadEditors);
const unwrappedEditorsAtom = unwrap(editorsAtom);
const loadableEditorsAtom = loadable(editorsAtom);

// suspends the UI while editors are loading
export const useEditors = () => {
    return useAtomValue(editorsAtom);
};

// will return undefined until editors are initialized. Does not block rendering.
export const useUnwrappedEditors = () => {
    return useAtomValue(unwrappedEditorsAtom);
};

// returns state, data and error, which will cause a rerender when the editors are loaded. Does not suspend the UI
export const useLoadableEditors = () => {
    return useAtomValue(loadableEditorsAtom);
};

export const useEditorsAsync = () => {
    const editorsPromise = useRef(
        (() => {
            let resolveFn!: (value: ExtendedEditor[]) => void;
            let rejectFn!: (reason?: any) => void;

            const promise = new Promise<ExtendedEditor[]>((resolve, reject) => {
                resolveFn = resolve;
                rejectFn = reject;
            });

            return { promise, resolve: resolveFn, reject: rejectFn };
        })(),
    );

    const editors = useLoadableEditors();

    useEffect(() => {
        if (editors.state === 'hasError') {
            editorsPromise.current.reject(editors.error);
        } else if (editors.state === 'hasData') {
            editorsPromise.current.resolve(editors.data);
        }
    }, [editors]);
    return editorsPromise.current.promise;
};

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
    return useCallback(
        async (documentType: string) => {
            const editors = await editorsPromise;
            const editor = getEditor(documentType, editors);
            if (editor && 'preload' in editor.Component) {
                console.log(
                    `Preloading editor for document '${documentType}': ${editor.config?.id}`,
                );
                await (
                    editor.Component as { preload: () => Promise<void> }
                ).preload();
            }
        },
        [editorsPromise],
    );
};
