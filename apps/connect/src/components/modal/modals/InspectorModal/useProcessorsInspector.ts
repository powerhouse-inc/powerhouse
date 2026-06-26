import type {
  ProcessorInfo,
  ProcessorsInspectorProps,
} from "@powerhousedao/design-system/connect";
import { useReactorClientModule } from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function useProcessorsInspector(): ProcessorsInspectorProps | undefined {
  const module = useReactorClientModule();
  const processorManager =
    module?.kind === "browser"
      ? module.reactorModule?.processorManager
      : undefined;
  const inspector = module?.kind === "worker" ? module.inspector : undefined;

  const available = useMemo(
    () => processorManager != null || inspector != null,
    [processorManager, inspector],
  );

  const getProcessors = useCallback((): Promise<ProcessorInfo[]> => {
    if (inspector) {
      return inspector.getProcessors() as Promise<ProcessorInfo[]>;
    }
    if (!processorManager) {
      return Promise.resolve([]);
    }
    return Promise.resolve(
      processorManager.getAll().map((tracked) => ({
        processorId: tracked.processorId,
        factoryId: tracked.factoryId,
        driveId: tracked.driveId,
        processorIndex: tracked.processorIndex,
        lastOrdinal: tracked.lastOrdinal,
        status: tracked.status,
        lastError: tracked.lastError,
        lastErrorTimestamp: tracked.lastErrorTimestamp,
      })),
    );
  }, [processorManager, inspector]);

  const onRetry = useCallback(
    async (processorId: string) => {
      if (inspector) {
        await inspector.retryProcessor(processorId);
        return;
      }
      if (!processorManager) return;
      const tracked = processorManager.get(processorId);
      if (tracked) {
        await tracked.retry();
      }
    },
    [processorManager, inspector],
  );

  if (!available) {
    return undefined;
  }

  return {
    getProcessors,
    onRetry,
  };
}
