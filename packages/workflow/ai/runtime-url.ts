// Points the module-level runtime client at the selected drive's
// workflow-runtime subgraph before an AI tool talks to it.
import { getPHStore } from "@powerhousedao/reactor-browser";
import { resolveDriveSwitchboard } from "@powerhousedao/reactor-browser/ai";
import {
  DEFAULT_RUNTIME_URL,
  setRuntimeUrl,
} from "../editors/workflow-editor/runtime-api.js";

const warnedDrives = new Set<string>();

export function syncRuntimeUrl(): void {
  if (typeof window === "undefined") return;
  const driveId = getPHStore()?.selectedDriveId;
  const switchboard = resolveDriveSwitchboard(driveId);
  // No resolvable switchboard (no selection, or a local/unsynced drive):
  // reset to the default rather than leaving a prior drive's URL attached.
  if (!switchboard && driveId && !warnedDrives.has(driveId)) {
    // A Workflows drive has to be attached as a REMOTE of the switchboard
    // that runs the workflow runtime; a local copy renders the studio against
    // whatever answers at the default URL.
    warnedDrives.add(driveId);
    console.warn(
      `[workflow] Drive "${driveId}" is not synced from a switchboard, so Workflow Studio falls back to ${DEFAULT_RUNTIME_URL}. ` +
        "Attach the switchboard's Workflows drive (its /d/<slug> URL) instead of a local drive.",
    );
  }
  setRuntimeUrl(
    switchboard
      ? `${switchboard.graphqlUrl}/workflow-runtime`
      : DEFAULT_RUNTIME_URL,
  );
}
