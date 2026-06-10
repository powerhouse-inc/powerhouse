import { useState } from "react";

export type DebugInspectorProps = {
  readonly supportedPgVersions: readonly number[];
  readonly currentPgVersion: number | null;
  readonly onResetToPgVersion: (major: number) => Promise<void>;
};

type Status = "idle" | "running" | "error";

export function DebugInspector({
  supportedPgVersions,
  currentPgVersion,
  onResetToPgVersion,
}: DebugInspectorProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [pendingMajor, setPendingMajor] = useState<number | null>(null);
  const [confirmMajor, setConfirmMajor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (major: number) => {
    setError(null);
    setConfirmMajor(null);
    setPendingMajor(major);
    setStatus("running");
    try {
      await onResetToPgVersion(major);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      setPendingMajor(null);
    }
  };

  const running = status === "running";

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-50">
          PGlite data dir
        </h2>
        <p className="mt-1 text-sm text-gray-700 dark:text-slate-200">
          Kill the reactor, delete the local IndexedDB, initialize a fresh
          Postgres cluster at the chosen major version, then reload. Useful for
          testing version-detection and migration flows.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 rounded-sm bg-gray-100 px-3 py-1 text-sm dark:bg-slate-700">
          <span className="text-gray-700 dark:text-slate-200">
            Current version:
          </span>
          <span className="font-semibold text-gray-900 dark:text-slate-50">
            {currentPgVersion === null
              ? "None (no data dir)"
              : `Postgres ${currentPgVersion}`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {supportedPgVersions.map((major) => {
          const isPending = pendingMajor === major && running;
          return (
            <button
              key={major}
              type="button"
              disabled={running}
              onClick={() => setConfirmMajor(major)}
              className="flex items-center gap-1 rounded-sm border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:effect disabled:opacity-50 dark:border-red-600 dark:bg-red-900 dark:text-red-100"
            >
              {isPending ? `Resetting to PG${major}…` : `Reset to PG${major}`}
            </button>
          );
        })}
      </div>

      {confirmMajor !== null && (
        <div className="flex shrink-0 items-center gap-3 rounded-sm border border-yellow-400 bg-yellow-50 px-3 py-2 dark:border-yellow-500 dark:bg-yellow-900">
          <span className="text-sm text-yellow-900 dark:text-yellow-100">
            This will permanently delete all local reactor data and recreate an
            empty database under Postgres {confirmMajor}. The page will reload.
          </span>
          <button
            type="button"
            onClick={() => void handleReset(confirmMajor)}
            className="rounded-sm bg-yellow-500 px-3 py-1 text-sm text-white hover:effect dark:bg-yellow-100 dark:text-slate-900"
          >
            Confirm reset to PG{confirmMajor}
          </button>
          <button
            type="button"
            onClick={() => setConfirmMajor(null)}
            className="rounded-sm border border-gray-300 bg-gray-50 px-3 py-1 text-sm text-gray-700 hover:effect dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-sm border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-600 dark:bg-red-900 dark:text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
