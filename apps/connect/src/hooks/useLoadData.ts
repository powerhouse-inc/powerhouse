import {
    createReactor,
    documentModelsAtom,
    storageAtom,
    useCreateFirstLocalDrive,
} from '#store';
import {
    useInitializeProcessorManager,
    useInitializeReactor,
    useSetSelectedDriveAndNodeFromUrl,
    useSubscribeToReactorEvents,
    useSubscribeToWindowEvents,
} from '@powerhousedao/state';
import { useAtomValue } from 'jotai';
import { useRenown } from './useRenown';

export function useLoadData() {
    const storage = useAtomValue(storageAtom);
    const documentModels = useAtomValue(documentModelsAtom);
    const renown = useRenown();
    useInitializeReactor(() => createReactor(storage, documentModels, renown));
    useSubscribeToReactorEvents();
    useSubscribeToWindowEvents();
    useInitializeProcessorManager();
    useCreateFirstLocalDrive();
    useSetSelectedDriveAndNodeFromUrl(true);
}
