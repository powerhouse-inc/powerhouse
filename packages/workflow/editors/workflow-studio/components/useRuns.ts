// One polling subscription to the run journal per studio pane. The header,
// the table and the editor toolbar all read from it, so they stay in step.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchRuns,
  type RunRecord,
  type RunsScope,
} from "../../workflow-editor/runtime-api.js";

const POLL_MS = 5000;

export interface RunsFeed {
  runs: RunRecord[] | null;
  error: string | null;
  reload: () => void;
}

// Inactive feeds hold no subscription, so a pane can borrow another's rows.
export function useRuns(scope: RunsScope, active = true): RunsFeed {
  const { workflowId, driveId, limit } = scope;
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Lets reload() run against the current scope without re-subscribing.
  const load = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = () => {
      fetchRuns({ workflowId, driveId, limit }).then(
        (result) => {
          if (cancelled) return;
          setRuns(result);
          setError(null);
        },
        (loadError: unknown) => {
          if (cancelled) return;
          setError(
            loadError instanceof Error ? loadError.message : String(loadError),
          );
        },
      );
    };
    load.current = run;
    // A scope change makes the previous rows the wrong rows.
    setRuns(null);
    run();
    const timer = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [workflowId, driveId, limit, active]);

  const reload = useCallback(() => load.current(), []);
  return { runs, error, reload };
}
