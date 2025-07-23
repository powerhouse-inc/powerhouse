import {
    createReactor,
    documentModelsAtom,
    storageAtom,
    useCreateFirstLocalDrive,
} from '#store';
import {
    useInitializeDocuments,
    useInitializeDrives,
    useInitializeProcessorManager,
    useInitializeReactor,
    useSubscribeToReactorEvents,
} from '@powerhousedao/state';
import { useAtomValue } from 'jotai';
import { useRenown } from './useRenown';

export function useLoadData() {
    const storage = useAtomValue(storageAtom);
    const documentModels = useAtomValue(documentModelsAtom);
    const renown = useRenown();
    useInitializeReactor(() => createReactor(storage, documentModels, renown));
    useSubscribeToReactorEvents();
    useInitializeDrives();
    useInitializeDocuments();
    useInitializeProcessorManager();
    useCreateFirstLocalDrive();
}
