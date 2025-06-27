import { useDefaultDocumentModelEditor } from '#hooks';
import { type DocumentModelLib, type EditorModule } from 'document-model';
import { atom, useAtomValue } from 'jotai';
import { atomWithLazy, loadable, unwrap } from 'jotai/utils';
import { useCallback, useEffect, useRef } from 'react';
import { externalPackagesAtom } from './external-packages.js';

async function loadBaseEditors() {
    const documentModelEditor = await import(
        '@powerhousedao/builder-tools/document-model-editor'
    );
    await import('@powerhousedao/builder-tools/style.css');
    const module = documentModelEditor.documentModelEditorModule;
    return [module] as EditorModule[];
}

function getEditorsFromModules(modules: DocumentModelLib[]) {
    return modules
        .map(module => module.editors)
        .reduce((acc, val) => acc.concat(val), []);
}

const baseEditorsAtom = atomWithLazy(loadBaseEditors);
baseEditorsAtom.debugLabel = 'baseEditorsAtomInConnect';
export const editorsAtom = atom(async get => {
    const baseEditors = await get(baseEditorsAtom);
    const externalModules = await get(externalPackagesAtom);
    const externalEditors = getEditorsFromModules(externalModules);

    return externalEditors.concat(baseEditors);
});
editorsAtom.debugLabel = 'editorsAtomInConnect';

const unwrappedEditorsAtom = unwrap(editorsAtom);
unwrappedEditorsAtom.debugLabel = 'unwrappedEditorsAtomInConnect';
const loadableEditorsAtom = loadable(editorsAtom);
loadableEditorsAtom.debugLabel = 'loadableEditorsAtomInConnect';

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
            e.config.id === preferredEditorId &&
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
                    `Preloading editor for document '${documentType}': ${editor.config.id}`,
                );
                await (
                    editor.Component as { preload: () => Promise<void> }
                ).preload();
            }
        },
        [editorsPromise],
    );
};
