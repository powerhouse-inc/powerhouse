import {
  CURRENT_PG_MAJOR,
  getCachedReactorPgMajor,
  migrateAllIfNeeded,
  subscribeReactorPgMajor,
} from "@powerhousedao/connect/utils";
import { useState, useSyncExternalStore } from "react";

let dismissed = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function dismiss() {
  dismissed = true;
  notify();
}

function subscribeDismissed(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getDismissed(): boolean {
  return dismissed;
}

export const MigrationBanner: React.FC = () => {
  const isDismissed = useSyncExternalStore(
    subscribeDismissed,
    getDismissed,
    () => false,
  );
  const major = useSyncExternalStore(
    subscribeReactorPgMajor,
    getCachedReactorPgMajor,
    () => undefined,
  );
  const [migrating, setMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (major === undefined || major === null || major === CURRENT_PG_MAJOR) {
    return null;
  }
  if (isDismissed) return null;

  const handleMigrate = async () => {
    setError(null);
    setMigrating(true);
    try {
      await migrateAllIfNeeded();
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMigrating(false);
    }
  };

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3">
      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-900 shadow-lg">
        <div className="flex-1">
          <div className="font-medium">
            Your local database uses Postgres {major}.
          </div>
          <div className="text-yellow-800">
            Migrate to Postgres {CURRENT_PG_MAJOR} to pick up the latest
            features. Your data will be backed up first.
          </div>
          {error && (
            <div className="mt-2 text-red-700">Migration failed: {error}</div>
          )}
        </div>
        <button
          type="button"
          disabled={migrating}
          onClick={handleMigrate}
          className="rounded bg-yellow-600 px-3 py-1 text-sm text-white hover:bg-yellow-700 disabled:opacity-50"
        >
          {migrating ? "Migrating…" : "Migrate now"}
        </button>
        <button
          type="button"
          disabled={migrating}
          onClick={dismiss}
          className="rounded border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
