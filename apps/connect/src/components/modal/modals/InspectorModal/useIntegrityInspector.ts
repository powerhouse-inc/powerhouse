import type { IntegrityInspectorProps } from "@powerhousedao/design-system/connect";
import {
  DocumentIntegrityService,
  useReactorClientModule,
} from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function useIntegrityInspector(): IntegrityInspectorProps | undefined {
  const reactorClientModule = useReactorClientModule();
  const reactorModule = reactorClientModule?.reactorModule;

  const service = useMemo(() => {
    if (!reactorModule) return undefined;

    return new DocumentIntegrityService(
      reactorModule.keyframeStore,
      reactorModule.operationStore,
      reactorModule.writeCache,
      reactorModule.documentView,
      reactorModule.documentModelRegistry,
    );
  }, [reactorModule]);

  const onValidate = useCallback(
    async (documentId: string, branch?: string) => {
      if (!service) {
        throw new Error("Reactor module not available");
      }
      return service.validateDocument(documentId, branch);
    },
    [service],
  );

  const onRebuildKeyframes = useCallback(
    async (documentId: string, branch?: string) => {
      if (!service) {
        throw new Error("Reactor module not available");
      }
      return service.rebuildKeyframes(documentId, branch);
    },
    [service],
  );

  const onRebuildSnapshots = useCallback(
    async (documentId: string, branch?: string) => {
      if (!service) {
        throw new Error("Reactor module not available");
      }
      return service.rebuildSnapshots(documentId, branch);
    },
    [service],
  );

  if (!service) {
    return undefined;
  }

  return {
    onValidate,
    onRebuildKeyframes,
    onRebuildSnapshots,
  };
}
