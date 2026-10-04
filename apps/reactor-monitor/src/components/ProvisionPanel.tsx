import type {
  ManagedReactorEntry,
  ReactorKind,
} from "@powerhousedao/reactor-monitor";
import { useState, type FormEvent } from "react";

/**
 * `local` is local-ONLY: brokered peer links and no gql factory. `connect`
 * polls gql AND can be linked to a sibling, because W3.0 composes a local
 * factory onto the gql scheme.
 *
 * Irrelevant to a `remote` reactor: its channels were chosen by whoever built
 * it, and the monitor reads them off its own report (multi-reactor W3.2).
 */
export type ProvisionSyncMode = "local" | "connect";

/**
 * Which attachment byte store a built reactor gets (multi-reactor W3.4).
 *
 * `none` is the default and means the reactor holds no attachment bytes at
 * all, which is a legitimate reactor and the cheapest one. `idb` survives a
 * reload; `memory` does not.
 */
export type ProvisionAttachmentStore = "none" | "idb" | "memory";

/**
 * One submission of the provision form. An object rather than positional
 * arguments because the fields are per-kind: `syncMode` configures a reactor
 * this monitor BUILDS, and `remoteUrl` names one it merely attaches to.
 */
export type ProvisionRequest = {
  readonly name: string;
  readonly kind: ReactorKind;
  readonly syncMode: ProvisionSyncMode;
  /** Required for `remote`: the reactor's GraphQL endpoint. */
  readonly remoteUrl?: string;
  /**
   * Built reactors only; `none` leaves the reactor without a byte store, and is
   * also the default `buildDescriptor` applies when this is absent. Optional
   * here so the type matches that default rather than contradicting it.
   */
  readonly attachmentStore?: ProvisionAttachmentStore;
};

export type ProvisionPanelProps = {
  readonly entries: readonly ManagedReactorEntry[];
  readonly selected: string | undefined;
  readonly onSelect: (name: string) => void;
  readonly onProvision: (request: ProvisionRequest) => void;
  readonly onKill: (name: string) => void;
};

function statusLabel(entry: ManagedReactorEntry): string {
  if (entry.status === "failed") {
    return `failed: ${entry.error.message}`;
  }
  return entry.status;
}

export function ProvisionPanel({
  entries,
  selected,
  onSelect,
  onProvision,
  onKill,
}: ProvisionPanelProps) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ReactorKind>("in-process");
  const [syncMode, setSyncMode] = useState<ProvisionSyncMode>("local");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [attachmentStore, setAttachmentStore] =
    useState<ProvisionAttachmentStore>("none");
  const [validationError, setValidationError] = useState<string | null>(null);

  const isRemote = kind === "remote";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    const trimmedUrl = remoteUrl.trim();
    if (!trimmed) {
      setValidationError("Name is required");
      return;
    }
    if (entries.some((entry) => entry.name === trimmed)) {
      setValidationError(`A reactor named "${trimmed}" already exists`);
      return;
    }
    // A remote reactor IS its URL: there is nothing to build, so an empty one
    // could only fail at the first request.
    if (isRemote && !trimmedUrl) {
      setValidationError("A GraphQL URL is required for a remote reactor");
      return;
    }
    setValidationError(null);
    onProvision({
      name: trimmed,
      kind,
      syncMode,
      attachmentStore,
      ...(isRemote ? { remoteUrl: trimmedUrl } : {}),
    });
    setName("");
  };

  return (
    <aside className="reactor-monitor__sidebar" aria-label="Reactor list">
      <h2>Reactors</h2>

      <form className="rm-provision-form" onSubmit={handleSubmit}>
        <label>
          Name
          <input
            onChange={(e) => setName(e.target.value)}
            placeholder="alpha"
            type="text"
            value={name}
          />
        </label>
        <label>
          Kind
          <select
            onChange={(e) => setKind(e.target.value as ReactorKind)}
            value={kind}
          >
            <option value="in-process">in-process</option>
            <option value="worker">worker</option>
            <option value="remote">remote (attach over HTTP)</option>
          </select>
        </label>
        {isRemote ? (
          <label>
            GraphQL URL
            <input
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="http://localhost:4001/graphql"
              type="text"
              value={remoteUrl}
            />
          </label>
        ) : (
          <label>
            Sync mode
            <select
              onChange={(e) => setSyncMode(e.target.value as ProvisionSyncMode)}
              value={syncMode}
            >
              <option value="local">local only (brokered)</option>
              <option value="connect">connect (gql + brokered)</option>
            </select>
          </label>
        )}
        {isRemote ? null : (
          <label>
            Attachment store
            <select
              onChange={(e) =>
                setAttachmentStore(e.target.value as ProvisionAttachmentStore)
              }
              value={attachmentStore}
            >
              <option value="none">none</option>
              <option value="idb">idb (survives a reload)</option>
              <option value="memory">memory (ephemeral)</option>
            </select>
          </label>
        )}
        {!isRemote && kind === "worker" && attachmentStore !== "none" ? (
          <p
            className="rm-note"
            data-testid="provision-attachments-worker-note"
          >
            Attachment byte movement is in-process only for now: a worker
            reactor would keep its store in the worker and its counts would have
            to cross the RPC boundary, so this setting is ignored.
          </p>
        ) : null}
        {!isRemote && kind === "in-process" && attachmentStore !== "none" ? (
          <p className="rm-note" data-testid="provision-attachments-note">
            Byte replication chases the refs a document model DECLARES as
            AttachmentRef fields. The default model set declares none, so a
            store provisioned here stays empty until a model with an attachment
            field is registered.
          </p>
        ) : null}
        {isRemote ? (
          <p className="rm-note" data-testid="provision-remote-note">
            Nothing is built here: the monitor attaches to that reactor and
            inspects it over reactor-api&apos;s inspection subgraph
            (&lt;url&gt;/inspection). Its repair levers and DB tab are served
            only if that host enabled them.
          </p>
        ) : null}
        <button className="rm-btn" type="submit">
          Provision
        </button>
        {validationError ? <p className="rm-error">{validationError}</p> : null}
      </form>

      {entries.length === 0 ? (
        <p className="reactor-monitor__placeholder">
          No reactors provisioned yet.
        </p>
      ) : (
        <ul className="rm-reactor-list">
          {entries.map((entry) => (
            <li
              key={entry.name}
              className={
                entry.name === selected
                  ? "rm-reactor-item rm-reactor-item-selected"
                  : "rm-reactor-item"
              }
            >
              <button
                className="rm-reactor-select"
                onClick={() => onSelect(entry.name)}
                type="button"
              >
                <strong>{entry.name}</strong>
                <span className="rm-note">{entry.descriptor.kind}</span>
                <span
                  className={
                    entry.status === "ready"
                      ? "rm-badge rm-badge-ok"
                      : entry.status === "failed"
                        ? "rm-badge rm-badge-error"
                        : "rm-badge"
                  }
                  title={statusLabel(entry)}
                >
                  {entry.status}
                </span>
              </button>
              <button
                className="rm-btn rm-btn-small"
                onClick={() => onKill(entry.name)}
                type="button"
              >
                Kill
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export default ProvisionPanel;
