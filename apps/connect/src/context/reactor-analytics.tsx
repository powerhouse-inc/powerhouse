import connectConfig from '#connect-config';
import { type PGlite } from '@electric-sql/pglite';
import { PGliteWorker } from '@electric-sql/pglite/worker';
import { type IAnalyticsStore } from '@powerhousedao/reactor-browser/analytics';
import {
    AnalyticsProvider,
    useAnalyticsStore,
} from '@powerhousedao/reactor-browser/analytics/context';
import { logger } from 'document-drive';
import { type ProcessorManager } from 'document-drive/processors/processor-manager';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import PGWorker from '../pglite-worker.js?worker';
import { useUnwrappedProcessorManager } from '../store/processors';

async function registerDiffAnalyzer(
    manager: ProcessorManager,
    analyticsStore: IAnalyticsStore,
) {
    const { processorFactory } = await import(
        '@powerhousedao/diff-analyzer/processors'
    );

    return await manager.registerFactory(
        '@powerhousedao/diff-analyzer',
        processorFactory({ analyticsStore }),
    );
}

function createPgLiteFactory(databaseName: string) {
    return () => {
        return Promise.resolve(
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call
            new PGliteWorker(
                new PGWorker({
                    name: 'pglite-worker',
                }),
                {
                    meta: {
                        databaseName,
                    },
                },
            ) as unknown as PGlite,
        );
    };
}

export function DiffAnalyzerProcessor() {
    const store = useAnalyticsStore();
    const manager = useUnwrappedProcessorManager();
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (!store || !manager || hasRegistered.current) {
            return;
        }

        hasRegistered.current = true;
        registerDiffAnalyzer(manager, store).catch(logger.error);
    }, [store, manager]);

    return null;
}

export function ReactorAnalyticsProvider({ children }: PropsWithChildren) {
    return (
        <AnalyticsProvider
            pgLiteFactory={createPgLiteFactory(
                connectConfig.analyticsDatabaseName,
            )}
            databaseName={connectConfig.analyticsDatabaseName}
        >
            <DiffAnalyzerProcessor />
            {children}
        </AnalyticsProvider>
    );
}

export default ReactorAnalyticsProvider;
