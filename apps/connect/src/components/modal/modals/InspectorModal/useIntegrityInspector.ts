import type { IntegrityInspectorProps } from "@powerhousedao/design-system/connect";
import {
  DocumentIntegrityService,
  useReactorClientModule,
  type RebuildResult,
  type ValidationResult,
} from "@powerhousedao/reactor-browser";
import { useCallback, useMemo } from "react";

export function useIntegrityInspector(): IntegrityInspectorProps | undefined {
  const module = useReactorClientModule();
  const reactorModule =
    module?.kind === "browser" ? module.reactorModule : undefined;
  const inspector = module?.kind === "worker" ? module.inspector : undefined;

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
    async (documentId: string, branch?: string): Promise<ValidationResult> => {
      if (inspector) {
        return (await inspector.validateDocument(
          documentId,
          branch,
        )) as ValidationResult;
      }
      if (!service) {
        throw new Error("Reactor module not available");
      }
      return service.validateDocument(documentId, branch);
    },
    [service, inspector],
  );

  const onRebuildKeyframes = useCallback(
    async (documentId: string, branch?: string): Promise<RebuildResult> => {
      if (inspector) {
        return (await inspector.rebuildKeyframes(
          documentId,
          branch,
        )) as RebuildResult;
      }
      if (!service) {
        throw new Error("Reactor module not available");
      }
      return service.rebuildKeyframes(documentId, branch);
    },
    [service, inspector],
  );

  const onRebuildSnapshots = useCallback(
    async (documentId: string, branch?: string): Promise<RebuildResult> => {
      if (inspector) {
        return (await inspector.rebuildSnapshots(
          documentId,
          branch,
        )) as RebuildResult;
      }
      if (!service) {
        throw new Error("Reactor module not available");
      }
      return service.rebuildSnapshots(documentId, branch);
    },
    [service, inspector],
  );

  if (!service && !inspector) {
    return undefined;
  }

  return {
    onValidate,
    onRebuildKeyframes,
    onRebuildSnapshots,
  };
}
