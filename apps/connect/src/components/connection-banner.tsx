import { useSyncExternalStore } from "react";
import {
  getWorkerConnectionStatus,
  subscribeWorkerConnection,
  type WorkerConnectionStatus,
} from "../connection-state.js";

const CONNECTED: WorkerConnectionStatus = "connected";

export const ConnectionBanner: React.FC = () => {
  const status = useSyncExternalStore(
    subscribeWorkerConnection,
    getWorkerConnectionStatus,
    () => CONNECTED,
  );

  if (status !== "lost") {
    return null;
  }

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3">
      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-destructive bg-warning px-4 py-3 text-sm text-warning-foreground shadow-lg">
        <div className="flex-1">
          <div className="font-semibold">Lost connection to the reactor</div>
          <div className="text-foreground">
            The background worker stopped responding. Reload to reconnect.
          </div>
        </div>
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
