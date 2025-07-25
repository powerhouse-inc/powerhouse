import {
    createReactor,
    documentModelsAtom,
    storageAtom,
    useCreateFirstLocalDrive,
} from '#store';
import { useInitializePHApp } from '@powerhousedao/state';
import { useAtomValue } from 'jotai';
import { useRenown } from './useRenown';

export function useLoadData() {
    const storage = useAtomValue(storageAtom);
    const documentModels = useAtomValue(documentModelsAtom);
    const renown = useRenown();
    useInitializePHApp(() => createReactor(storage, documentModels, renown));
    useCreateFirstLocalDrive();
}
