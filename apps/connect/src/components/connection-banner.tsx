import { showPHModal } from "@powerhousedao/reactor-browser";
import { useSyncExternalStore } from "react";
import {
  getWorkerConnectionStatus,
  subscribeWorkerConnection,
  type WorkerConnectionStatus,
} from "../connection-state.js";

const CONNECTED: WorkerConnectionStatus = "connected";

const BANNER_TEXT: Record<
  Exclude<WorkerConnectionStatus, "connected">,
  { title: string; detail: string }
> = {
  failed: {
    title: "Reactor worker failed to load",
    detail:
      "The background worker script could not be loaded. Reload to retry.",
  },
  lost: {
    title: "Lost connection to the reactor",
    detail: "The background worker stopped responding. Reload to reconnect.",
  },
  "storage-held": {
    title: "Waiting for another Connect tab",
    detail:
      "Another Connect tab still holds local storage. Close or reload the other Connect tabs to continue.",
  },
  "version-conflict": {
    title: "Connect tabs are on different builds",
    detail:
      "Open tabs keep restarting the reactor. Close the other Connect tabs, then reload.",
  },
  "storage-unusable": {
    title: "Local storage is unusable",
    detail:
      "The local database stopped responding. Clear storage to start over, or reload to retry.",
  },
};

export const ConnectionBanner: React.FC = () => {
  const status = useSyncExternalStore(
    subscribeWorkerConnection,
    getWorkerConnectionStatus,
    () => CONNECTED,
  );

  if (status === "connected") {
    return null;
  }

  const { title, detail } = BANNER_TEXT[status];

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3">
      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-destructive bg-warning px-4 py-3 text-sm text-warning-foreground shadow-lg">
        <div className="flex-1">
          <div className="font-semibold">{title}</div>
          <div className="text-foreground">{detail}</div>
        </div>
        {status === "storage-unusable" && (
          <button
            type="button"
            onClick={() => showPHModal({ type: "clearStorage" })}
            className="rounded-sm bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:hover-effect"
          >
            Clear storage
          </button>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-sm bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:hover-effect"
        >
          Reload
        </button>
      </div>
    </div>
  );
};
