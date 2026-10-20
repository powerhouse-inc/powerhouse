import type {
  CatchUpInspectorProps,
  CatchUpStatus,
} from "@powerhousedao/design-system/connect";
import { useReactorClientModule } from "@powerhousedao/reactor-browser";
import { useCallback, useState } from "react";

export function useCatchUpInspector(): CatchUpInspectorProps | undefined {
  const module = useReactorClientModule();
  const catchUp =
    module?.kind === "browser" ? module.reactorModule?.catchUp : undefined;
  const inspector = module?.kind === "worker" ? module.inspector : undefined;
  const [status, setStatus] = useState<CatchUpStatus | undefined>();

  const onRefresh = useCallback(async (): Promise<void> => {
    if (inspector) {
      setStatus((await inspector.getCatchUpStatus()) as CatchUpStatus);
      return;
    }
    if (catchUp) {
      setStatus(catchUp.status());
    }
  }, [catchUp, inspector]);

  const onSweepNow = useCallback(async (): Promise<void> => {
    if (inspector) {
      await inspector.sweepCatchUp();
      return;
    }
    if (catchUp) {
      await catchUp.sweepNow();
    }
  }, [catchUp, inspector]);

  if (!catchUp && !inspector) {
    return undefined;
  }

  return {
    status,
    onRefresh,
    onSweepNow,
  };
}
