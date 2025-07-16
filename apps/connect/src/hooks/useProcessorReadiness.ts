import connectConfig from '#connect-config';
import type { ProcessorManager } from 'document-drive/processors/processor-manager';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useExternalProcessors } from '../store/external-processors';

export enum ProcessorReadinessStatus {
    Initializing = 'INITIALIZING',
    Success = 'SUCCESS',
    Failed = 'FAILED',
}

interface ProcessorState {
    completedProcessors: string[];
    failedProcessors: string[];
    completedExternalProcessors: string[];
    failedExternalProcessors: string[];
}

export function useProcessorReadiness(
    manager: ProcessorManager | null | undefined,
): ProcessorReadinessStatus {
    const externalProcessors = useExternalProcessors();

    // State to track processor readiness
    const [state, setState] = useState<ProcessorState>({
        completedProcessors: [],
        failedProcessors: [],
        completedExternalProcessors: [],
        failedExternalProcessors: [],
    });

    // Define expected core processors based on config
    const expectedCoreProcessors = useMemo(() => {
        const processors: string[] = [];

        if (connectConfig.analytics.diffProcessorEnabled) {
            processors.push('@powerhousedao/diff-analyzer');
        }
        if (connectConfig.analytics.driveAnalyticsEnabled) {
            processors.push('@powerhousedao/common/drive-analytics');
        }

        return processors;
    }, []);

    // Count expected external processors
    const expectedExternalCount = useMemo(() => {
        if (!connectConfig.analytics.externalProcessorsEnabled) {
            return 0;
        }
        return externalProcessors.length;
    }, [externalProcessors.length]);

    // Calculate readiness status
    const status = useMemo(() => {
        const totalCoreCompleted =
            state.completedProcessors.length + state.failedProcessors.length;
        const totalExternalCompleted =
            state.completedExternalProcessors.length +
            state.failedExternalProcessors.length;

        const coreReady =
            expectedCoreProcessors.length === 0 ||
            totalCoreCompleted >= expectedCoreProcessors.length;
        const externalReady =
            expectedExternalCount === 0 ||
            totalExternalCompleted >= expectedExternalCount;

        // If not all processors have completed yet
        if (!coreReady || !externalReady) {
            return ProcessorReadinessStatus.Initializing;
        }

        // All processors have completed - check if any failed
        const hasFailures =
            state.failedProcessors.length > 0 ||
            state.failedExternalProcessors.length > 0;

        return hasFailures
            ? ProcessorReadinessStatus.Failed
            : ProcessorReadinessStatus.Success;
    }, [state, expectedCoreProcessors.length, expectedExternalCount]);

    // Helper to add processor to completed list (avoiding duplicates)
    const addToCompleted = useCallback(
        (identifier: string, isExternal: boolean) => {
            setState(prev => {
                const key = isExternal
                    ? 'completedExternalProcessors'
                    : 'completedProcessors';
                const currentList = prev[key];

                // Avoid duplicates
                if (currentList.includes(identifier)) return prev;

                return {
                    ...prev,
                    [key]: [...currentList, identifier],
                };
            });
        },
        [],
    );

    // Helper to add processor to failed list (avoiding duplicates)
    const addToFailed = useCallback(
        (identifier: string, isExternal: boolean) => {
            setState(prev => {
                const key = isExternal
                    ? 'failedExternalProcessors'
                    : 'failedProcessors';
                const currentList = prev[key];

                // Avoid duplicates
                if (currentList.includes(identifier)) return prev;

                return {
                    ...prev,
                    [key]: [...currentList, identifier],
                };
            });
        },
        [],
    );

    useEffect(() => {
        if (!manager) {
            return;
        }

        // Type-safe event handlers
        const handleProcessorRegistered = (event: { identifier: string }) => {
            // Track core processors by specific name
            if (expectedCoreProcessors.includes(event.identifier)) {
                addToCompleted(event.identifier, false);
            }

            // Track external processors (any identifier starting with "external:")
            if (event.identifier.startsWith('external:')) {
                addToCompleted(event.identifier, true);
            }
        };

        const handleProcessorFailed = (event: {
            identifier: string;
            error: string;
            stage: 'factory' | 'initAndUpgrade';
        }) => {
            // Track failed core processors
            if (expectedCoreProcessors.includes(event.identifier)) {
                addToFailed(event.identifier, false);
            }

            // Track failed external processors
            if (event.identifier.startsWith('external:')) {
                addToFailed(event.identifier, true);
            }
        };

        manager.on('processorRegistered', handleProcessorRegistered);
        manager.on('processorFailed', handleProcessorFailed);

        // Cleanup
        return () => {
            manager.off('processorRegistered', handleProcessorRegistered);
            manager.off('processorFailed', handleProcessorFailed);
        };
    }, [manager, expectedCoreProcessors, addToCompleted, addToFailed]);

    return status;
}
