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
        <h2 className="text-lg font-semibold text-foreground">
          PGlite data dir
        </h2>
        <p className="mt-1 text-sm text-foreground">
          Kill the reactor, delete the local IndexedDB, initialize a fresh
          Postgres cluster at the chosen major version, then reload. Useful for
          testing version-detection and migration flows.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 rounded-sm bg-muted px-3 py-1 text-sm">
          <span className="text-foreground">Current version:</span>
          <span className="font-semibold text-foreground">
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
              className="flex items-center gap-1 rounded-sm border border-destructive bg-destructive/10 px-3 py-1.5 text-sm text-destructive hover:hover-effect disabled:disabled-effect"
            >
              {isPending ? `Resetting to PG${major}…` : `Reset to PG${major}`}
            </button>
          );
        })}
      </div>

      {confirmMajor !== null && (
        <div className="flex shrink-0 items-center gap-3 rounded-sm border border-warning bg-warning/10 px-3 py-2">
          <span className="text-sm text-warning">
            This will permanently delete all local reactor data and recreate an
            empty database under Postgres {confirmMajor}. The page will reload.
          </span>
          <button
            type="button"
            onClick={() => void handleReset(confirmMajor)}
            className="rounded-sm bg-warning px-3 py-1 text-sm text-warning-foreground hover:hover-effect"
          >
            Confirm reset to PG{confirmMajor}
          </button>
          <button
            type="button"
            onClick={() => setConfirmMajor(null)}
            className="rounded-sm border border-border bg-background px-3 py-1 text-sm text-foreground hover:hover-effect"
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-sm border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}
