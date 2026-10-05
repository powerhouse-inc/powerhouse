/**
 * Attachment byte movement for the selected reactor (multi-reactor W3.4, §4b).
 *
 * The counts are the whole point: a lazy fetch-on-reference model has two
 * failure modes that look identical at the moment they happen -- a peer that
 * never had the bytes, and a peer whose attachment reference index has not
 * caught up with its own sync -- and they are only separable over time. So
 * `waiting` and `not found` are shown side by side rather than folded into one
 * "missing" number, and the retry lever is here because an operator who can
 * see that a peer caught up should not have to wait for a reboot.
 *
 * An in-process reactor is read through its own built attachment handle. A
 * REMOTE reactor has no such handle, so its store is read over the inspection
 * surface instead (§4b): a Switchboard serves bytes directly with no
 * fetch-on-reference replicator, so it reports store presence and bytes held
 * and says the replicator counters do not apply.
 */
import type { InspectorAttachmentInfo } from "@powerhousedao/reactor";
import type {
  AttachmentReplicationEntry,
  AttachmentReplicatorStatus,
  ManagedAttachments,
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

function LocalAttachmentsPanel({
  attachments,
}: {
  attachments: ManagedAttachments;
}) {
  const [status, setStatus] = useState<AttachmentReplicatorStatus | null>(null);
  const [entries, setEntries] = useState<AttachmentReplicationEntry[]>([]);
  const [served, setServed] = useState({
    served: 0,
    bytesServed: 0,
    refused: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
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
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

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

function RemoteAttachmentsPanel({ reactor }: { reactor: ManagedReactor }) {
  const inspector = reactor.inspector;
  const [info, setInfo] = useState<InspectorAttachmentInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInfo(await inspector.getAttachmentInfo());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [inspector]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks-extra/set-state-in-effect
    void load();
    const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  if (error) {
    return (
      <section className="rm-panel" data-testid="attachments-panel">
        <h3>Attachments</h3>
        <p className="rm-error">{error}</p>
      </section>
    );
  }

  if (!info) {
    return (
      <section className="rm-panel" data-testid="attachments-panel">
        <h3>Attachments</h3>
        <p className="rm-note">Loading...</p>
      </section>
    );
  }

  if (!info.present) {
    return (
      <section className="rm-panel" data-testid="attachments-unavailable">
        <h3>Attachments</h3>
        <p className="rm-note">
          This remote reactor reports no attachment byte store, so it neither
          keeps nor serves attachment bytes.
        </p>
      </section>
    );
  }

  return (
    <section className="rm-panel" data-testid="attachments-panel">
      <h3>Attachments</h3>

      <p className="rm-note">
        Store: <strong>{info.storeKind}</strong>
        {" · "}
        Replicator:{" "}
        <strong>
          {info.hasReplicator
            ? info.replicatorRunning
              ? "running"
              : "stopped"
            : "none (served directly by this host)"}
        </strong>
      </p>

      <div className="rm-stat-bar" data-testid="attachments-counts">
        <span>
          Bytes held: <strong>{formatBytes(info.bytesHeld)}</strong>
        </span>
        {info.hasReplicator ? (
          <>
            <span>
              Refs seen: <strong>{info.refsSeen}</strong>
            </span>
            <span>
              Held: <strong>{info.held}</strong>
            </span>
            <span>
              In flight: <strong>{info.pendingFetches}</strong>
            </span>
            <span title="A pending upload, or a peer whose reference index has not caught up">
              Waiting: <strong>{info.waiting}</strong>
            </span>
            <span>
              Not found: <strong>{info.notFound}</strong>
            </span>
            <span>
              Failed: <strong>{info.failed}</strong>
            </span>
          </>
        ) : null}
      </div>

      {info.hasReplicator ? null : (
        <p className="rm-note" data-testid="attachments-no-replicator">
          This host serves attachment bytes directly and runs no
          fetch-on-reference replicator, so the per-hash fetch counters do not
          apply here.
        </p>
      )}

      {info.lastError ? (
        <p className="rm-note" data-testid="attachments-last-error">
          Last transport error: {info.lastError}
        </p>
      ) : null}
    </section>
  );
}

export function AttachmentsTab({ reactor }: AttachmentsTabProps) {
  const attachments = reactor.attachments;
  if (attachments) {
    return <LocalAttachmentsPanel attachments={attachments} />;
  }
  if (reactor.kind === "remote") {
    return <RemoteAttachmentsPanel reactor={reactor} />;
  }
  return (
    <section className="rm-panel" data-testid="attachments-unavailable">
      <h3>Attachments</h3>
      <p className="rm-note">
        This reactor holds no attachment byte store, so it neither keeps nor
        serves attachment bytes. Provision a reactor with an attachment store to
        move bytes.
      </p>
      <p className="rm-note">
        {reactor.kind === "in-process"
          ? "Set an attachment store on the provision form."
          : "Worker-hosted reactors are not wired yet: the store would live in the worker and its counts would have to cross the RPC boundary."}
      </p>
    </section>
  );
}

export default AttachmentsTab;
