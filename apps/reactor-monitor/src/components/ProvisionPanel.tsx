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
