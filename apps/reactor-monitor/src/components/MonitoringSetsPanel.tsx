import { useState, type FormEvent } from "react";

/**
 * The monitoring-sets bar above the provision form (multi-reactor §6): switch
 * the active set, create a new one, or delete the current one. A set is a named
 * group of provisioned reactors that survives a refresh; switching reloads that
 * set's reactors into the monitor.
 */
export type MonitoringSetsPanelProps = {
  readonly setNames: readonly string[];
  readonly activeSetName: string;
  readonly onSwitch: (name: string) => void;
  readonly onCreate: (name: string) => void;
  readonly onDelete: (name: string) => void;
};

export function MonitoringSetsPanel({
  setNames,
  activeSetName,
  onSwitch,
  onCreate,
  onDelete,
}: MonitoringSetsPanelProps) {
  const [newName, setNewName] = useState("");

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      return;
    }
    onCreate(trimmed);
    setNewName("");
  };

  return (
    <section aria-label="Monitoring sets" className="rm-sets">
      <h2>Sets</h2>
      <label>
        Active set
        <select
          data-testid="monitor-set-select"
          onChange={(e) => onSwitch(e.target.value)}
          value={activeSetName}
        >
          {setNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="rm-btn rm-btn-small"
        data-testid="monitor-set-delete"
        disabled={setNames.length <= 1}
        onClick={() => onDelete(activeSetName)}
        type="button"
      >
        Delete set
      </button>
      <form className="rm-sets-create" onSubmit={handleCreate}>
        <input
          data-testid="monitor-set-name"
          onChange={(e) => setNewName(e.target.value)}
          placeholder="new set"
          type="text"
          value={newName}
        />
        <button
          className="rm-btn rm-btn-small"
          data-testid="monitor-set-create"
          type="submit"
        >
          Create set
        </button>
      </form>
    </section>
  );
}

export default MonitoringSetsPanel;
