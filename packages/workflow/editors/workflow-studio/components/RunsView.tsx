// The runs pane: what scope is being shown, how to fire it, and the journal.
// The run feed is owned by the studio so the header shares these rows.
import { useState } from "react";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { RunsTable } from "./RunsTable.js";

export function RunsView(props: {
  title: string;
  runs: RunRecord[] | null;
  error: string | null;
  reload: () => void;
  showWorkflow: boolean;
  // Present only for manual-trigger workflows.
  onFire?: () => Promise<string | null>;
}) {
  const [firing, setFiring] = useState(false);
  const [fireError, setFireError] = useState<string | null>(null);
  const { runs } = props;

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-semibold text-slate-800">
          {props.title}
        </h2>
        <span className="grow" />
        {props.onFire ? (
          <button
            type="button"
            disabled={firing}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            onClick={() => {
              setFiring(true);
              setFireError(null);
              props.onFire!()
                .then((fireResultError) => setFireError(fireResultError))
                .catch((fireCallError: unknown) =>
                  setFireError(
                    fireCallError instanceof Error
                      ? fireCallError.message
                      : String(fireCallError),
                  ),
                )
                .finally(() => {
                  setFiring(false);
                  props.reload();
                });
            }}
          >
            {firing ? "Running…" : "▶ Run workflow"}
          </button>
        ) : null}
      </div>
      {fireError ? (
        <p className="mb-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600">
          {fireError}
        </p>
      ) : null}
      {props.error ? (
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">
          The workflow runtime is unreachable, so runs cannot be listed:{" "}
          {props.error}
        </p>
      ) : runs === null ? (
        <p className="text-sm text-slate-400">Loading runs…</p>
      ) : runs.length === 0 ? (
        <p className="rounded-md border border-solid border-slate-200 bg-white px-3 py-6 text-center text-sm text-slate-400">
          No runs yet
          {props.onFire ? " — run the workflow to record the first one" : ""}.
        </p>
      ) : (
        <RunsTable
          runs={runs}
          showWorkflow={props.showWorkflow}
          onChanged={props.reload}
        />
      )}
    </div>
  );
}
