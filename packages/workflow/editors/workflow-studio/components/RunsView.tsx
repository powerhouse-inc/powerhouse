// The runs pane: what scope is being shown, how to fire it, and the journal.
// The run feed is owned by the studio so the header shares these rows.
import { useState } from "react";
import type { RunRecord } from "../../workflow-editor/runtime-api.js";
import { RunsTable } from "./RunsTable.js";
import { Button, Icon } from "./ui.js";

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
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">
          {props.title}
        </h2>
        <span className="grow" />
        {props.onFire ? (
          <Button
            variant="primary"
            disabled={firing}
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
            <Icon name="play" className="h-3.5 w-3.5" />
            {firing ? "Running…" : "Run now"}
          </Button>
        ) : null}
      </div>
      {fireError ? (
        <p className="mb-3 rounded-md bg-wf-fail/10 px-3 py-2 text-[13px] text-wf-fail">
          {fireError}
        </p>
      ) : null}
      {props.error ? (
        <p className="rounded-md bg-wf-warn/10 px-3 py-2 text-[13px] text-wf-warn">
          Runs can't be listed because the workflow runtime is unreachable.
          <span className="mt-0.5 block text-xs opacity-80">{props.error}</span>
        </p>
      ) : runs === null ? (
        <p className="text-[13px] text-muted-foreground">Loading runs…</p>
      ) : runs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="text-[13px] font-medium text-foreground">No runs yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {props.onFire
              ? "Use Run now to record the first one."
              : "Runs appear here once the trigger fires."}
          </p>
        </div>
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
