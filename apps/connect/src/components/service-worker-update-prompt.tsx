import {
  getServiceWorkerUpdateAvailable,
  serviceWorkerManager,
  subscribeServiceWorkerUpdate,
} from "@powerhousedao/connect/utils";
import { useSyncExternalStore } from "react";

// Shown when a new service worker has installed and is waiting. The user opts
// into the refresh so an update never interrupts in-progress work; clicking
// activates the waiting worker, which reloads the page (see serviceWorkerManager).
export const ServiceWorkerUpdatePrompt: React.FC = () => {
  const updateAvailable = useSyncExternalStore(
    subscribeServiceWorkerUpdate,
    getServiceWorkerUpdateAvailable,
    () => false,
  );

  if (!updateAvailable) return null;

  return (
    <div className="absolute inset-x-0 bottom-0 z-30 flex justify-center p-3">
      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-foreground bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
        <div className="flex-1 font-medium">
          A new version of Connect is available.
        </div>
        <button
          type="button"
          onClick={() => serviceWorkerManager.applyUpdate()}
          className="rounded-sm bg-primary-foreground px-3 py-1 text-sm font-medium text-primary hover:hover-effect"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};
