import { getHMRModule, useSubscribeToPHPackages } from '#services';
import {
    createReactor,
    loadBaseDocumentModelEditor,
    loadBaseDocumentModels,
    loadExternalPackages,
    storageAtom,
    useCreateFirstLocalDrive,
} from '#store';
import {
    useDocumentModelModules,
    useInitializePHApp,
} from '@powerhousedao/state';
import { useAtomValue } from 'jotai';
import { useRenown } from './useRenown';

async function loadPHPackages() {
    const basePackages = await loadExternalPackages();
    const baseDocumentModels = loadBaseDocumentModels();
    const baseDocumentModelEditor = await loadBaseDocumentModelEditor();
    return [...basePackages, ...baseDocumentModels, baseDocumentModelEditor];
}

export function useLoadData() {
    const storage = useAtomValue(storageAtom);
    const documentModels = useDocumentModelModules();
    const renown = useRenown();
    useInitializePHApp(
        createReactor(storage, documentModels || [], renown),
        loadPHPackages(),
        getHMRModule(),
    );
    useCreateFirstLocalDrive();
    useSubscribeToPHPackages();
}
