import connectConfig from '#connect-config';
import { type IAnalyticsStore } from '@powerhousedao/reactor-browser/analytics';
import {
    AnalyticsProvider,
    useAnalyticsStore,
} from '@powerhousedao/reactor-browser/analytics/context';
import { logger } from 'document-drive';
import { type ProcessorManager } from 'document-drive/processors/processor-manager';
import { useEffect, type PropsWithChildren } from 'react';
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

export function DiffAnalyzerProcessor() {
    const store = useAnalyticsStore();
    const manager = useUnwrappedProcessorManager();

    useEffect(() => {
        if (!store || !manager) {
            return;
        }
        console.log('registering diff analyzer');
        registerDiffAnalyzer(manager, store).catch(logger.error);
    }, [store, manager]);

    return null;
}

export function ReactorAnalyticsProvider({ children }: PropsWithChildren) {
    return (
        <AnalyticsProvider
            databaseName={`${connectConfig.routerBasename}:analytics`}
        >
            {children}
        </AnalyticsProvider>
    );
}

export default ReactorAnalyticsProvider;
