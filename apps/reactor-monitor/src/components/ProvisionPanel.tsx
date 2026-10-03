import type { ManagedReactorEntry } from "@powerhousedao/reactor-monitor";
import { useState, type FormEvent } from "react";

export type ProvisionPanelProps = {
  readonly entries: readonly ManagedReactorEntry[];
  readonly selected: string | undefined;
  readonly onSelect: (name: string) => void;
  readonly onProvision: (name: string, kind: "worker" | "in-process") => void;
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
  const [kind, setKind] = useState<"worker" | "in-process">("in-process");
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setValidationError("Name is required");
      return;
    }
    if (entries.some((entry) => entry.name === trimmed)) {
      setValidationError(`A reactor named "${trimmed}" already exists`);
      return;
    }
    setValidationError(null);
    onProvision(trimmed, kind);
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
            onChange={(e) => setKind(e.target.value as "worker" | "in-process")}
            value={kind}
          >
            <option value="in-process">in-process</option>
            <option value="worker">worker</option>
          </select>
        </label>
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
