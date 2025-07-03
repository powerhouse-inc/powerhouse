import { atomStore } from '@powerhousedao/common';
import { type DocumentDriveDocument } from 'document-drive';
import { ProcessorManager } from 'document-drive/processors/processor-manager';
import { useAtomValue } from 'jotai';
import { atomWithLazy, unwrap } from 'jotai/utils';
import { reactorAtom } from './reactor.js';

async function createProcessorManager() {
    const reactor = await atomStore.get(reactorAtom);
    const manager = new ProcessorManager(reactor.listeners, reactor);

    // hook up processor manager to drive added event
    reactor.on('driveAdded', async (drive: DocumentDriveDocument) => {
        await manager.registerDrive(drive.header.id);
    });

    return manager;
}

export const processorManagerAtom = atomWithLazy(createProcessorManager);
processorManagerAtom.debugLabel = 'processorManagerAtomInConnect';

// blocks rendering until processor manager is initialized
export const useProcessorManager = () => useAtomValue(processorManagerAtom);

// will return undefined until processor manager is initialized. Does not block rendering.
const unwrappedProcessorManager = unwrap(processorManagerAtom);
unwrappedProcessorManager.debugLabel = 'unwrappedProcessorManagerInConnect';

export const useUnwrappedProcessorManager = () =>
    useAtomValue(unwrappedProcessorManager);

atomStore.sub(reactorAtom, () => {
    return atomStore.get(processorManagerAtom);
});
