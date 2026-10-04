/**
 * Attachment byte movement for the selected reactor (multi-reactor W3.4).
 *
 * The counts are the whole point: a lazy fetch-on-reference model has two
 * failure modes that look identical at the moment they happen -- a peer that
 * never had the bytes, and a peer whose attachment reference index has not
 * caught up with its own sync -- and they are only separable over time. So
 * `waiting` and `not found` are shown side by side rather than folded into one
 * "missing" number, and the retry lever is here because an operator who can
 * see that a peer caught up should not have to wait for a reboot.
 */
import type {
  AttachmentReplicationEntry,
  AttachmentReplicatorStatus,
  ManagedReactor,
} from "@powerhousedao/reactor-monitor";
import { useCallback, useEffect, useState } from "react";

export type AttachmentsTabProps = {
  readonly reactor: ManagedReactor;
};

const POLL_INTERVAL_MS = 2000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function AttachmentsTab({ reactor }: AttachmentsTabProps) {
  const attachments = reactor.attachments;
  const [status, setStatus] = useState<AttachmentReplicatorStatus | null>(null);
  const [entries, setEntries] = useState<AttachmentReplicationEntry[]>([]);
  const [served, setServed] = useState({
    served: 0,
    bytesServed: 0,
    refused: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!attachments) return;
    try {
      setStatus(await attachments.status());
      setEntries(attachments.report());
      setServed(attachments.servedStats());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [attachments]);

  useEffect(() => {
    if (!attachments) return;
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [attachments, load]);

  if (!attachments) {
    return (
      <section className="rm-panel" data-testid="attachments-unavailable">
        <h3>Attachments</h3>
        <p className="rm-note">
          This reactor holds no attachment byte store, so it neither keeps nor
          serves attachment bytes. Provision a reactor with an attachment store
          to move bytes.
        </p>
        <p className="rm-note">
          {reactor.kind === "in-process"
            ? "Set an attachment store on the provision form."
            : reactor.kind === "worker"
              ? "Worker-hosted reactors are not wired yet: the store would live in the worker and its counts would have to cross the RPC boundary."
              : "A remote reactor's attachment service belongs to that deployment and is reached over its own HTTP routes, not through this handle."}
        </p>
      </section>
    );
  }

  const retry = (): void => {
    attachments.retry();
    void load();
  };

  return (
    <section className="rm-panel" data-testid="attachments-panel">
      <h3>Attachments</h3>

      {error ? <p className="rm-error">{error}</p> : null}

      <p className="rm-note">
        Store: <strong>{attachments.storeKind}</strong>
        {" · "}
        Replicator: <strong>{status?.running ? "running" : "stopped"}</strong>
        {" · "}
        Boot re-scan:{" "}
        <strong>
          {status?.backlogScanned
            ? "done"
            : "no reference index (live operations only)"}
        </strong>
      </p>

      <div className="rm-stat-bar" data-testid="attachments-counts">
        <span>
          Refs seen: <strong>{status?.refsSeen ?? 0}</strong>
        </span>
        <span>
          Held: <strong>{status?.held ?? 0}</strong>
        </span>
        <span>
          Bytes held: <strong>{formatBytes(status?.bytesHeld ?? 0)}</strong>
        </span>
        <span>
          In flight:{" "}
          <strong>{(status?.queued ?? 0) + (status?.fetching ?? 0)}</strong>
        </span>
        <span title="A pending upload, or a peer whose reference index has not caught up">
          Waiting: <strong>{status?.waiting ?? 0}</strong>
        </span>
        <span>
          Not found: <strong>{status?.notFound ?? 0}</strong>
        </span>
        <span>
          Failed: <strong>{status?.failed ?? 0}</strong>
        </span>
        <span>
          Served to peers:{" "}
          <strong>
            {served.served} ({formatBytes(served.bytesServed)})
          </strong>
        </span>
      </div>

      <p className="rm-note" data-testid="attachments-sources">
        Byte sources: peers [{attachments.peers().join(", ") || "none"}],
        Switchboards [{attachments.switchboardSources().join(", ") || "none"}]
      </p>

      {status?.lastError ? (
        <p className="rm-note" data-testid="attachments-last-error">
          Last transport error: {status.lastError}
        </p>
      ) : null}

      <button className="rm-btn rm-btn-small" onClick={retry} type="button">
        Re-chase missing bytes
      </button>

      {entries.length === 0 ? (
        <p className="reactor-monitor__placeholder">
          No attachment references seen yet.
        </p>
      ) : (
        <div className="rm-table-wrap">
          <table className="rm-table">
            <thead>
              <tr>
                <th>Hash</th>
                <th>State</th>
                <th>Documents</th>
                <th>Attempts</th>
                <th>Not-found answers</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.hash}>
                  <td title={entry.hash}>{entry.hash.slice(0, 12)}…</td>
                  <td>{entry.state}</td>
                  <td>{entry.documentIds.length}</td>
                  <td>{entry.attempts}</td>
                  <td>{entry.notFoundAnswers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default AttachmentsTab;
