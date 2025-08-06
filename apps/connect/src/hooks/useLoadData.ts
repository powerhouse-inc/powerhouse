import { getHMRModule, useSubscribeToVetraPackages } from '#services';
import {
    createReactor,
    loadCommonPackage,
    loadExternalPackages,
    storageAtom,
    useCreateFirstLocalDrive,
} from '#store';
import {
    useDocumentModelModules,
    useInitializePHApp,
    useReactor,
} from '@powerhousedao/state';
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';
import { useRenown } from './useRenown';

async function loadVetraPackages() {
    const commonPackage = await loadCommonPackage();
    const externalPackages = await loadExternalPackages();
    return [commonPackage, ...externalPackages];
}

export function useLoadData() {
    const storage = useAtomValue(storageAtom);
    const documentModels = useDocumentModelModules();
    const renown = useRenown();
    const reactor = useReactor();

    useInitializePHApp(
        createReactor(storage, documentModels || [], renown),
        loadVetraPackages(),
        getHMRModule(),
    );
    useCreateFirstLocalDrive();
    useSubscribeToVetraPackages();

    useEffect(() => {
        if (!reactor) return;
        reactor.setDocumentModelModules(documentModels || []);
    }, [reactor, documentModels]);
}
