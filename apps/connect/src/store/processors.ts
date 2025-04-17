import { atomStore } from '#store';
import { processorFactory as DiffAnalyzerProcessor } from '@powerhousedao/diff-analyzer/processors';
import { type DocumentDriveDocument } from 'document-drive';
import { ProcessorManager } from 'document-drive/processors/processor-manager';
import { useAtomValue } from 'jotai';
import { atomWithLazy, unwrap } from 'jotai/utils';
import { analyticsStoreAtom } from './analytics.js';
import { reactorAtom } from './reactor.js';

async function createProcessorManager() {
    const reactor = await atomStore.get(reactorAtom);
    const analyticsStore = await atomStore.get(analyticsStoreAtom);
    const manager = new ProcessorManager(reactor.listeners, reactor);

    const hostModule = {
        analyticsStore,
    };

    await manager.registerFactory(
        '@powerhousedao/diff-analyzer',
        DiffAnalyzerProcessor(hostModule),
    );

    // hook up processor manager to drive added event
    reactor.on('driveAdded', async (drive: DocumentDriveDocument) => {
        await manager.registerDrive(drive.state.global.id);
    });

    return manager;
}

export const processorManagerAtom = atomWithLazy(createProcessorManager);

// blocks rendering until processor manager is initialized
export const useProcessorManager = () => useAtomValue(processorManagerAtom);

// will return undefined until processor manager is initialized. Does not block rendering.
const unwrappedProcessorManager = unwrap(processorManagerAtom);

export const useUnwrappedProcessorManager = () =>
    useAtomValue(unwrappedProcessorManager);
