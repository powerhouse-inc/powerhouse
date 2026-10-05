// Points the module-level runtime client at the selected drive's
// workflow-runtime subgraph before an AI tool talks to it.
import { resolveDriveSwitchboard } from "@powerhousedao/reactor-browser/ai";
import {
  DEFAULT_RUNTIME_URL,
  setRuntimeUrl,
} from "../editors/workflow-editor/runtime-api.js";

export function syncRuntimeUrl(): void {
  if (typeof window === "undefined") return;
  const switchboard = resolveDriveSwitchboard(window.ph?.selectedDriveId);
  // No resolvable switchboard (no selection, or a local/unsynced drive):
  // reset to the default rather than leaving a prior drive's URL attached.
  setRuntimeUrl(
    switchboard
      ? `${switchboard.graphqlUrl}/workflow-runtime`
      : DEFAULT_RUNTIME_URL,
  );
}
