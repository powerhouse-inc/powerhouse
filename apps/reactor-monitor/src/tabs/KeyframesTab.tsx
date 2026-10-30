import type {
  KeyframeCleanupRun,
  KeyframeReclaim,
} from "@powerhousedao/reactor";
import type { KeyframeLevers } from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_ALLOWED,
  AdminGateNote,
  type AdminGate,
} from "../components/AdminGate.js";
import { ProgressBar } from "../components/ProgressBar.js";

export type KeyframesTabProps = {
  /** Absent where the reactor serves no levers. */
  readonly levers?: KeyframeLevers;
  readonly admin?: AdminGate;
  /** Tests pass a short one. */
  readonly pollIntervalMs?: number;
};

const POLL_INTERVAL_MS = 2000;

const REASON_LABELS: Readonly<Record<string, string>> = {
  "beyond-keep": "Past the keep count",
  "deleted-document": "Deleted documents",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatCount(count: number): string {
  return count.toLocaleString("en-US");
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function runProgress(run: KeyframeCleanupRun): number {
  return run.documentsTotal > 0 ? run.documentsSeen / run.documentsTotal : 0;
}

function RunReport({ run }: { readonly run: KeyframeCleanupRun }) {
  return (
    <div className="rm-result" data-testid="keyframe-report">
      <div className="rm-stat-bar">
        <span>
          Keyframes: <strong>{formatCount(run.totals.rows)}</strong>
        </span>
        <span>
          Stored: <strong>{formatBytes(run.totals.bytes)}</strong>
        </span>
        <span>
          Streams: <strong>{formatCount(run.totals.streams)}</strong>
        </span>
        <span>
          {run.dryRun ? "Would remove" : "To remove"}:{" "}
          <strong>
            {formatCount(run.totals.removableRows)} (
            {formatBytes(run.totals.removableBytes)})
          </strong>
        </span>
        {run.dryRun ? null : (
          <span>
            Removed:{" "}
            <strong>
              {formatCount(run.totals.removedRows)} (
              {formatBytes(run.totals.removedBytes)})
            </strong>
          </span>
        )}
      </div>

      <h4>By document type</h4>
      <div className="rm-table-wrap">
        <table className="rm-table" data-testid="keyframe-types">
          <thead>
            <tr>
              <th>Document type</th>
              <th>Interval</th>
              <th>Keep</th>
              <th>Streams</th>
              <th>Keyframes</th>
              <th>Stored</th>
              <th>To remove</th>
              <th>Bytes to remove</th>
              {run.dryRun ? null : <th>Removed</th>}
            </tr>
          </thead>
          <tbody>
            {run.types.map((type) => (
              <tr key={type.documentType}>
                <td>{type.documentType}</td>
                <td>{type.interval}</td>
                <td>{type.keep ?? "all"}</td>
                <td>{formatCount(type.streams)}</td>
                <td>{formatCount(type.rows)}</td>
                <td>{formatBytes(type.bytes)}</td>
                <td>{formatCount(type.removableRows)}</td>
                <td>{formatBytes(type.removableBytes)}</td>
                {run.dryRun ? null : <td>{formatCount(type.removedRows)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4>By reason</h4>
      {run.reasons.length === 0 ? (
        <p className="rm-note">Nothing to remove.</p>
      ) : (
        <ul data-testid="keyframe-reasons">
          {run.reasons.map((reason) => (
            <li key={reason.reason}>
              {REASON_LABELS[reason.reason] ?? reason.reason}:{" "}
              {formatCount(reason.rows)} keyframes, {formatBytes(reason.bytes)}
            </li>
          ))}
        </ul>
      )}

      {run.topStreams.length > 0 ? (
        <>
          <h4>Largest streams</h4>
          <div className="rm-table-wrap">
            <table className="rm-table" data-testid="keyframe-top-streams">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Scope</th>
                  <th>Branch</th>
                  <th>Reason</th>
                  <th>To remove</th>
                  <th>Bytes to remove</th>
                </tr>
              </thead>
              <tbody>
                {run.topStreams.map((stream) => (
                  <tr
                    key={`${stream.documentId}:${stream.scope}:${stream.branch}`}
                  >
                    <td>{stream.documentId}</td>
                    <td>{stream.documentType}</td>
                    <td>{stream.scope}</td>
                    <td>{stream.branch}</td>
                    <td>{REASON_LABELS[stream.reason] ?? stream.reason}</td>
                    <td>{formatCount(stream.removableRows)}</td>
                    <td>{formatBytes(stream.removableBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function ReclaimReport({ reclaim }: { readonly reclaim: KeyframeReclaim }) {
  return (
    <div className="rm-result" data-testid="keyframe-reclaim">
      <p>{reclaim.message}</p>
      {reclaim.tableBytesBefore !== null ? (
        <p className="rm-note">
          Keyframe table: {formatBytes(reclaim.tableBytesBefore)}
          {reclaim.tableBytesAfter !== null
            ? ` to ${formatBytes(reclaim.tableBytesAfter)}`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

/** Keyframe clean-up: a dry run, the clean-up it describes, and the disk space after. */
export function KeyframesTab({
  levers,
  admin = ADMIN_ALLOWED,
  pollIntervalMs = POLL_INTERVAL_MS,
}: KeyframesTabProps) {
  const [run, setRun] = useState<KeyframeCleanupRun | null>(null);
  const [reclaim, setReclaim] = useState<KeyframeReclaim | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"clean" | "reclaim" | null>(
    null,
  );

  const load = useCallback(async () => {
    if (!levers) return;
    try {
      const [latestRun, latestReclaim] = await Promise.all([
        levers.getKeyframeCleanup(),
        levers.getKeyframeReclaim(),
      ]);
      // A read that started before a lever was pulled can answer after it.
      setRun((current) => latestRun ?? current);
      setReclaim((current) => latestReclaim ?? current);
    } catch (reason) {
      setError(errorText(reason));
    }
  }, [levers]);

  const running = run?.state === "running" || reclaim?.state === "running";

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
  }, [load]);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), pollIntervalMs);
    return () => clearInterval(timer);
  }, [load, pollIntervalMs, running]);

  const pull = useCallback(async (lever: () => Promise<void>) => {
    setError(null);
    setConfirming(null);
    try {
      await lever();
    } catch (reason) {
      setError(errorText(reason));
    }
  }, []);

  const start = (dryRun: boolean) => {
    void pull(async () => {
      if (levers) setRun(await levers.startKeyframeCleanup({ dryRun }));
    });
  };

  const disabled = !admin.enabled || !levers || running;
  const preview = run?.dryRun && run.state === "done" ? run : null;

  return (
    <div className="rm-tab">
      <AdminGateNote gate={admin} />
      <div className="rm-tab-header">
        <h2>Keyframes</h2>
        <div className="rm-actions">
          <button
            className="rm-btn"
            disabled={disabled}
            onClick={() => start(true)}
            type="button"
          >
            Preview
          </button>
          <button
            className="rm-btn rm-btn-warn"
            disabled={disabled}
            onClick={() => setConfirming("clean")}
            type="button"
          >
            Clean up
          </button>
          <button
            className="rm-btn rm-btn-warn"
            disabled={disabled}
            onClick={() => setConfirming("reclaim")}
            type="button"
          >
            Reclaim space
          </button>
        </div>
      </div>

      {confirming === "clean" ? (
        <div className="rm-confirm" data-testid="keyframe-confirm">
          <span>
            {preview
              ? `This deletes ${formatCount(preview.totals.removableRows)} keyframes (${formatBytes(preview.totals.removableBytes)}). Reads replay from the operation log instead. Continue?`
              : "This deletes the keyframes past each type's keep count and all keyframes of deleted documents. Run Preview first to see how many. Continue?"}
          </span>
          <button
            className="rm-btn rm-btn-warn"
            onClick={() => start(false)}
            type="button"
          >
            Confirm
          </button>
          <button
            className="rm-btn"
            onClick={() => setConfirming(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {confirming === "reclaim" ? (
        <div className="rm-confirm" data-testid="keyframe-confirm">
          <span>
            This rewrites the Keyframe table once the store is quiet. The store
            answers nothing during the rewrite, and it needs free disk of about
            twice the table&apos;s live size. Continue?
          </span>
          <button
            className="rm-btn rm-btn-warn"
            onClick={() => {
              void pull(async () => {
                if (levers) setReclaim(await levers.reclaimKeyframeSpace());
              });
            }}
            type="button"
          >
            Confirm
          </button>
          <button
            className="rm-btn"
            onClick={() => setConfirming(null)}
            type="button"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {error ? <p className="rm-error">{error}</p> : null}

      {run?.state === "running" ? (
        <div data-testid="keyframe-progress">
          <ProgressBar
            detail={`${run.documentsSeen} of ${run.documentsTotal} documents`}
            fraction={runProgress(run)}
            label={run.dryRun ? "Preview" : "Clean-up"}
            tone="active"
          />
          {run.parked ? (
            <p className="rm-note">Paused: the catch-up priority is 0.</p>
          ) : null}
          <button
            className="rm-btn"
            onClick={() => {
              void pull(async () => {
                await levers?.cancelKeyframeCleanup();
              });
            }}
            type="button"
          >
            Stop
          </button>
        </div>
      ) : null}

      {run?.state === "failed" ? (
        <p className="rm-error">The run failed: {run.error}</p>
      ) : null}
      {run?.state === "cancelled" ? (
        <p className="rm-note">
          The run was stopped. What it removed stays removed; the next run goes
          on from what is left.
        </p>
      ) : null}

      {run ? (
        <RunReport run={run} />
      ) : (
        <p className="rm-placeholder">
          No clean-up has run yet. Preview shows what one would remove.
        </p>
      )}

      {reclaim ? <ReclaimReport reclaim={reclaim} /> : null}
    </div>
  );
}
