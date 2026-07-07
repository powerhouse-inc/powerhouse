import type { WorkerInspectorProps } from "@powerhousedao/design-system/connect";
import { useReactorClientModule } from "@powerhousedao/reactor-browser";
import { useMemo } from "react";

export function useWorkerInspector(): WorkerInspectorProps | undefined {
  const module = useReactorClientModule();
  const adminClient =
    module?.kind === "worker" ? module.adminClient : undefined;

  return useMemo(() => {
    if (!adminClient) {
      return undefined;
    }
    return {
      getInfo: () => adminClient.info(),
      onRestart: () => adminClient.restart(),
    };
  }, [adminClient]);
}
