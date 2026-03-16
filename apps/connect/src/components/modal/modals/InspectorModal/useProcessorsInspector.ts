import type { ProcessorsInspectorProps } from "@powerhousedao/design-system/connect";
import { useReactorClientModule } from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function useProcessorsInspector(): ProcessorsInspectorProps | undefined {
  const reactorClientModule = useReactorClientModule();
  const processorManager = reactorClientModule?.reactorModule?.processorManager;

  const hasProcessorManager = useMemo(
    () => processorManager != null,
    [processorManager],
  );

  const getProcessors = useCallback(async () => {
    if (!processorManager) {
      return [];
    }

    return processorManager.getAll().map((tracked) => ({
      processorId: tracked.processorId,
      factoryId: tracked.factoryId,
      driveId: tracked.driveId,
      processorIndex: tracked.processorIndex,
      lastOrdinal: tracked.lastOrdinal,
      status: tracked.status,
      lastError: tracked.lastError,
      lastErrorTimestamp: tracked.lastErrorTimestamp,
    }));
  }, [processorManager]);

  const onRetry = useCallback(
    async (processorId: string) => {
      if (!processorManager) return;
      const tracked = processorManager.get(processorId);
      if (tracked) {
        await tracked.retry();
      }
    },
    [processorManager],
  );

  if (!hasProcessorManager) {
    return undefined;
  }

  return {
    getProcessors,
    onRetry,
  };
}
