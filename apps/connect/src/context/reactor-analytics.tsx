import connectConfig from '#connect-config';
import type { PGlite } from '@electric-sql/pglite';
import type { IAnalyticsStore } from '@powerhousedao/reactor-browser/analytics';
import {
    AnalyticsProvider,
    useAnalyticsStoreAsync,
} from '@powerhousedao/reactor-browser/analytics/context';
import { childLogger } from 'document-drive';
import type { ProcessorManager } from 'document-drive/processors/processor-manager';
import { Suspense, useEffect, useRef, type PropsWithChildren } from 'react';
import { useUnwrappedProcessorManager } from '../store/processors';

const logger = childLogger(['reactor-analytics']);

function createPgLiteFactoryWorker(databaseName: string) {
    return async () => {
        const PGWorker = (await import('../workers/pglite-worker.js?worker'))
            .default;

        const { PGliteWorker } = await import('@electric-sql/pglite/worker');

        const worker = new PGWorker({
            name: 'pglite-worker',
        });

        worker.onmessage = event => {
            logger.verbose(event.data);
        };

        worker.onerror = event => {
            logger.error(event.message);
            throw event.error;
        };

        const pgLiteWorker = new PGliteWorker(worker, {
            meta: {
                databaseName,
            },
        });

        await pgLiteWorker.waitReady;

        return pgLiteWorker as unknown as PGlite;
    };
}

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

export function DiffAnalyzerProcessor() {
    const store = useAnalyticsStoreAsync();
    const manager = useUnwrappedProcessorManager();
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (!store.data || !manager || hasRegistered.current) {
            return;
        }

        hasRegistered.current = true;
        registerDiffAnalyzer(manager, store.data).catch(logger.error);
    }, [store.data, manager]);

    return null;
}

export function ReactorAnalyticsProvider({ children }: PropsWithChildren) {
    return (
        <Suspense fallback={<div>Loading Reactor Analytics</div>}>
            <AnalyticsProvider
                options={{
                    databaseName: connectConfig.analytics.databaseName,
                    pgLiteFactory: connectConfig.analytics.useWorker
                        ? createPgLiteFactoryWorker(
                              connectConfig.analytics.databaseName,
                          )
                        : undefined,
                }}
            >
                <Suspense fallback={<div>Loading diff analyzer...</div>}>
                    <DiffAnalyzerProcessor />
                </Suspense>
                {children}
            </AnalyticsProvider>
        </Suspense>
    );
}

export default ReactorAnalyticsProvider;
