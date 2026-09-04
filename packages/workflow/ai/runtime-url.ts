// Points the module-level runtime client at the selected drive's
// workflow-runtime subgraph before an AI tool talks to it. When no
// switchboard can be resolved (no selection, local drive with no default
// URL) the client keeps its existing URL, which falls back to the local
// development default.
import { resolveDriveSwitchboard } from "@powerhousedao/reactor-browser/ai";
import { setRuntimeUrl } from "../editors/workflow-editor/runtime-api.js";

export function syncRuntimeUrl(): void {
  if (typeof window === "undefined") return;
  const switchboard = resolveDriveSwitchboard(window.ph?.selectedDriveId);
  if (switchboard) {
    setRuntimeUrl(`${switchboard.graphqlUrl}/workflow-runtime`);
  }
}
