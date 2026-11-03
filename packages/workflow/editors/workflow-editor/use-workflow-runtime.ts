// Which switchboard's workflow runtime an editor talks to: the one serving the
// selected drive, else the only one that runs workflows. Resolved from the
// host's switchboard directory; there is no default URL to fall back on.
import {
  resolveSwitchboard,
  useSelectedDriveSafe,
  useSwitchboards,
  type SwitchboardEntry,
} from "@powerhousedao/reactor-browser";
import { useEffect, useState } from "react";
import { workflowRuntimeUrl } from "./runtime-client.js";

export type WorkflowRuntimeState =
  | { status: "resolving" }
  | { status: "ready"; url: string; switchboard: SwitchboardEntry }
  | { status: "unavailable"; error: Error };

export function useWorkflowRuntime(): WorkflowRuntimeState {
  const switchboards = useSwitchboards();
  const [drive] = useSelectedDriveSafe();
  const driveId = drive?.header.id;
  const [state, setState] = useState<WorkflowRuntimeState>({
    status: "resolving",
  });

  useEffect(() => {
    const controller = new AbortController();
    resolveSwitchboard(switchboards, {
      documentId: driveId,
      need: "workflows",
      signal: controller.signal,
    }).then(
      (switchboard) => {
        if (controller.signal.aborted) return;
        setState({
          status: "ready",
          url: workflowRuntimeUrl(switchboard),
          switchboard,
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "unavailable",
          error: error instanceof Error ? error : new Error(String(error)),
        });
      },
    );
    return () => controller.abort();
  }, [switchboards, driveId]);

  return state;
}
