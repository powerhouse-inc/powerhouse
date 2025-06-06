import connectConfig from '#connect-config';
import type { PGlite } from '@electric-sql/pglite';
import type { IAnalyticsStore } from '@powerhousedao/reactor-browser/analytics';
import {
    AnalyticsProvider,
    useAnalyticsStore,
} from '@powerhousedao/reactor-browser/analytics/context';
import { logger } from 'document-drive';
import type { ProcessorManager } from 'document-drive/processors/processor-manager';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import { useUnwrappedProcessorManager } from '../store/processors';

function createPgLiteFactoryWorker(databaseName: string) {
    return async () => {
        const PGWorker = (await import('../workers/pglite-worker.js?worker'))
            .default;

        const { PGliteWorker } = await import('@electric-sql/pglite/worker');

        const worker = new PGWorker({
            name: 'pglite-worker',
        });
        worker.onerror = event => {
            logger.error(event.message);
            throw event.error;
        };

        const pgLiteWorker = new PGliteWorker(worker, {
            meta: {
                databaseName,
            },
        });

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
            options={{
                databaseName: connectConfig.analytics.databaseName,
                pgLiteFactory: connectConfig.analytics.useWorker
                    ? createPgLiteFactoryWorker(
                          connectConfig.analytics.databaseName,
                      )
                    : undefined,
            }}
        >
            <DiffAnalyzerProcessor />
            {children}
        </AnalyticsProvider>
    );
}

export default ReactorAnalyticsProvider;
