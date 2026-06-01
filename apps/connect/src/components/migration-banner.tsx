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

  const handleMigrate = () => {
    setError(null);
    setMigrating(true);
    migrateAllIfNeeded()
      .then(() => {
        window.location.reload();
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
        setMigrating(false);
      });
  };

  return (
    <div className="absolute inset-x-0 top-0 z-30 flex justify-center p-3">
      <div className="flex max-w-3xl items-center gap-3 rounded-lg border border-yellow-500 bg-yellow-400 px-4 py-3 text-sm text-gray-800 shadow-lg dark:border-yellow-400 dark:bg-yellow-500 dark:text-slate-100">
        <div className="flex-1">
          <div className="font-semibold">
            Your local database uses Postgres {major}.
          </div>
          <div className="text-gray-800 dark:text-slate-100">
            Migrate to Postgres {CURRENT_PG_MAJOR} to pick up the latest
            features. Your data will be backed up first.
          </div>
          {error && (
            <div className="mt-2 font-medium text-red-900 dark:text-red-400">
              Migration failed: {error}
            </div>
          )}
        </div>
        <button
          type="button"
          disabled={migrating}
          onClick={handleMigrate}
          className="rounded-sm bg-gray-900 px-3 py-1 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 dark:bg-slate-50 dark:text-slate-900 dark:hover:bg-slate-100"
        >
          {migrating ? "Migrating…" : "Migrate now"}
        </button>
        <button
          type="button"
          disabled={migrating}
          onClick={dismiss}
          className="rounded-sm border border-gray-900 bg-transparent px-3 py-1 text-sm font-medium text-gray-800 hover:bg-gray-900/10 disabled:opacity-50 dark:border-slate-50 dark:text-slate-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
