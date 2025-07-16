import connectConfig from '#connect-config';
import type { IAnalyticsStore } from '@powerhousedao/reactor-browser/analytics';
import {
    AnalyticsProvider,
    useAnalyticsStoreAsync,
} from '@powerhousedao/reactor-browser/analytics/context';
import { useRelationalDb } from '@powerhousedao/reactor-browser/operational';
import {
    live,
    useSetPGliteDB,
    type PGlite,
    type PGliteWithLive,
} from '@powerhousedao/reactor-browser/pglite';
import { childLogger } from 'document-drive';
import type { ProcessorManager } from 'document-drive/processors/processor-manager';
import { type IRelationalDb } from 'document-drive/processors/types';
import { useEffect, useRef, type PropsWithChildren } from 'react';
import {
    useExternalProcessors,
    type Processors,
} from '../store/external-processors';
import { useUnwrappedProcessorManager } from '../store/processors';

const logger = childLogger(['reactor-analytics']);

function createPgLiteFactoryWorker(databaseName: string) {
    return async () => {
        const PGWorker = (await import('../workers/pglite-worker.js?worker'))
            .default;

        const { PGliteWorker } = await import(
            '@powerhousedao/reactor-browser/pglite'
        );

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
            extensions: {
                live,
            },
        });

        await pgLiteWorker.waitReady;

        return pgLiteWorker as unknown as PGlite;
    };
}

async function registerExternalProcessors(
    manager: ProcessorManager,
    analyticsStore: IAnalyticsStore,
    relationalDb: IRelationalDb,
    processorName: string,
    processorFactory: Processors,
) {
    return await manager.registerFactory(
        processorName,
        processorFactory({ analyticsStore, relationalDb }),
    );
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

async function registerDriveAnalytics(
    manager: ProcessorManager,
    analyticsStore: IAnalyticsStore,
) {
    const { processorFactory } = await import(
        '@powerhousedao/common/drive-analytics'
    );

    return await manager.registerFactory(
        '@powerhousedao/common/drive-analytics',
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

export function DriveAnalyticsProcessor() {
    const store = useAnalyticsStoreAsync();
    const manager = useUnwrappedProcessorManager();
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (!store.data || !manager || hasRegistered.current) {
            return;
        }

        hasRegistered.current = true;
        registerDriveAnalytics(manager, store.data)
            .then(() => {
                logger.verbose('Drive analytics processor registered');
            })
            .catch(logger.error);
    }, [store.data, manager]);

    return null;
}

export function ExternalProcessors() {
    const externalProcessors = useExternalProcessors();
    const store = useAnalyticsStoreAsync();
    const relationalDb = useRelationalDb();
    const manager = useUnwrappedProcessorManager();
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (
            !store.data ||
            !manager ||
            hasRegistered.current ||
            externalProcessors.length === 0 ||
            !relationalDb.db
        ) {
            return;
        }

        hasRegistered.current = true;

        let index = 0;
        for (const { packageName, processors } of externalProcessors) {
            registerExternalProcessors(
                manager,
                store.data,
                relationalDb.db,
                `${packageName}-${index}`,
                processors,
            ).catch(logger.error);

            index++;
        }
    }, [store.data, manager, relationalDb]);

    return null;
}

export function ProcessorManagerProvider({ children }: PropsWithChildren) {
    const pgLiteFactory = connectConfig.analytics.useWorker
        ? createPgLiteFactoryWorker(connectConfig.analytics.databaseName)
        : undefined;

    const setPGliteDB = useSetPGliteDB();

    // Initialize and handle PGlite factory
    useEffect(() => {
        if (!pgLiteFactory) {
            // If no factory, set to not loading with null db
            setPGliteDB({
                db: null,
                isLoading: false,
                error: null,
            });
            return;
        }

        // Resolve the factory
        pgLiteFactory()
            .then(db => {
                setPGliteDB({
                    db: db as unknown as PGliteWithLive,
                    isLoading: false,
                    error: null,
                });
            })
            .catch((err: unknown) => {
                const error =
                    err instanceof Error ? err : new Error(String(err));
                setPGliteDB({
                    db: null,
                    isLoading: false,
                    error,
                });
            });
    }, []);

    const content = (
        <>
            {connectConfig.analytics.diffProcessorEnabled && (
                <DiffAnalyzerProcessor />
            )}
            {connectConfig.analytics.driveAnalyticsEnabled && (
                <DriveAnalyticsProcessor />
            )}
            {connectConfig.analytics.externalProcessorsEnabled && (
                <ExternalProcessors />
            )}
            {children}
        </>
    );

    return (
        <AnalyticsProvider
            options={{
                databaseName: connectConfig.analytics.databaseName,
                pgLiteFactory,
            }}
        >
            {content}
        </AnalyticsProvider>
    );
}

export default ProcessorManagerProvider;
