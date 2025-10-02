import {
  addTrigger,
  registerNewPullResponderTrigger,
  removeTrigger,
} from "@powerhousedao/reactor-browser";
import { useCallback } from "react";
export function useDebugHandlers() {
  const onAddTrigger = useCallback(
    async (driveId: string) => {
      const url = window.prompt("url") || "";

      const pullResponderTrigger = await registerNewPullResponderTrigger(
        driveId,
        url,
        { pullInterval: 6000 },
      );
      if (!pullResponderTrigger) return;
      await addTrigger(driveId, pullResponderTrigger);
    },
    [addTrigger, registerNewPullResponderTrigger],
  );

  const onRemoveTrigger = useCallback(
    async (driveId: string) => {
      const triggerId = window.prompt("triggerId:");

      if (triggerId) {
        await removeTrigger(driveId, triggerId);
      }
    },
    [removeTrigger],
  );

  const onAddInvalidTrigger = useCallback(
    async (driveId: string) => {
      const url = window.prompt("url") || "";

      await addTrigger(driveId, {
        id: "some-invalid-id",
        type: "PullResponder",
        data: {
          interval: "3000",
          listenerId: "invalid-listener-id",
          url,
        },
      });
    },
    [addTrigger],
  );

  return {
    onAddTrigger,
    onRemoveTrigger,
    onAddInvalidTrigger,
  };
}
