import { useDefaultDocumentModelEditor } from '#hooks/useDefaultDocumentModelEditor/index';
import { DocumentModelsModule } from '#utils/types';
import { EditorModule } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy, loadable, unwrap } from 'jotai/utils';
import { useCallback, useEffect, useRef } from 'react';
import { externalPackagesAtom } from './external-packages';

export const LOCAL_DOCUMENT_EDITORS = import.meta.env.LOCAL_DOCUMENT_EDITORS;

async function loadBaseEditors() {
    const DocumentModelEditor = (
        await import('@powerhousedao/builder-tools/document-model-editor')
    ).documentModelEditorModule;
    return [DocumentModelEditor];
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
        )) as unknown as Record<string, EditorModule>;
        console.log('Loaded local document editors:', localEditors);
        return Object.values(localEditors);
    } catch (e) {
        console.error('Error loading local document editors', e);
        return [];
    }
}

const baseEditorsAtom = atomWithLazy(loadBaseEditors);
const dynamicEditorsAtom = atomWithLazy(loadDynamicEditors);

export const editorsAtom = atom(async get => {
    const baseEditors = await get(baseEditorsAtom);
    const dynamicEditors = await get(dynamicEditorsAtom);
    const externalModules = await get(externalPackagesAtom);
    const externalEditors = getEditorsFromModules(externalModules);

    return dynamicEditors.concat(externalEditors, baseEditors);
});

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
            let resolveFn!: (value: EditorModule[]) => void;
            let rejectFn!: (reason?: any) => void;

            const promise = new Promise<EditorModule[]>((resolve, reject) => {
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
    editors: EditorModule[],
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
