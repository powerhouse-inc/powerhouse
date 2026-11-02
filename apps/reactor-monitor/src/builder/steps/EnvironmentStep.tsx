import { useState } from "react";
import { BROWSER_ENV_ALLOWLIST } from "../../controller/api.js";
import type { HostEnv } from "../../host-rules/index.js";
import { withEnv } from "../draft.js";
import type { StepProps } from "./types.js";

type Row = { id: number; key: string; value: string };

let nextRow = 0;

function envOf(rows: readonly Row[]): HostEnv {
  return Object.fromEntries(
    rows.filter((row) => row.key !== "").map((row) => [row.key, row.value]),
  );
}

export function EnvironmentStep({ draft, engine, onDraft }: StepProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    Object.entries(draft.env).map(([key, value]) => ({
      id: nextRow++,
      key,
      value,
    })),
  );
  const commit = (updated: Row[]) => {
    setRows(updated);
    onDraft(withEnv(draft, envOf(updated)));
  };
  const change = (id: number, field: "key" | "value", text: string) =>
    rows.map((row) => (row.id === id ? { ...row, [field]: text } : row));

  return (
    <section className="hb-step">
      <h2 className="hb-h2">Environment</h2>
      <p className="hb-note">
        Every reactor in this host reads these variables when it starts. They
        stay with the draft and aren't written into the host files.
      </p>
      <div className="hb-card">
        {rows.map((row, index) => {
          const issues = engine.issues.filter(
            (issue) => issue.path === `env.${row.key}`,
          );
          const repeated = rows
            .slice(0, index)
            .some((other) => other.key === row.key && row.key !== "");
          return (
            <div className="hb-envrow" key={row.id}>
              <input
                aria-label="Name"
                className="hb-mono"
                onBlur={() => commit(rows)}
                onChange={(event) =>
                  setRows(change(row.id, "key", event.target.value.trim()))
                }
                placeholder="NAME"
                type="text"
                value={row.key}
              />
              <input
                aria-label={`Value of ${row.key || "the new variable"}`}
                className="hb-mono"
                onChange={(event) =>
                  commit(change(row.id, "value", event.target.value))
                }
                type="text"
                value={row.value}
              />
              <button
                aria-label={`Remove ${row.key || "the new variable"}`}
                className="hb-btn hb-btn-sm"
                onClick={() =>
                  commit(rows.filter((other) => other.id !== row.id))
                }
                type="button"
              >
                Remove
              </button>
              <div className="hb-verdict">
                {repeated ? (
                  <p className="hb-why">Another row above sets this name.</p>
                ) : null}
                {issues.map((issue) => (
                  <p className="hb-why" key={issue.message}>
                    {issue.message}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
        {rows.length === 0 ? (
          <p className="hb-note hb-pad">No variables yet.</p>
        ) : null}
      </div>
      <div>
        <button
          className="hb-btn"
          onClick={() =>
            setRows([...rows, { id: nextRow++, key: "", value: "" }])
          }
          type="button"
        >
          Add a variable
        </button>
      </div>
      <p className="hb-note">
        Accepted names: {BROWSER_ENV_ALLOWLIST.keys.join(", ")}, and any name
        starting with {BROWSER_ENV_ALLOWLIST.prefixes.join(" or ")}. Names that
        load code are always refused.
      </p>
    </section>
  );
}
