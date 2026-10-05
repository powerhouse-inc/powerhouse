// One polling subscription to the run journal per studio pane. The header,
// the table and the editor toolbar all read from it, so they stay in step.
import type {
  RunRecord,
  RunsScope,
} from "../../workflow-editor/runtime-client.js";
import { useRunPagesQuery } from "../../workflow-editor/runtime-context.js";
import { runsOfPages } from "../../workflow-editor/runtime-queries.js";

const POLL_MS = 5000;

export interface RunsFeed {
  // Every page loaded so far, newest first.
  runs: RunRecord[] | null;
  error: string | null;
  reload: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
}

// Inactive feeds hold no subscription, so a pane can borrow another's rows.
export function useRuns(scope: RunsScope, active = true): RunsFeed {
  const { workflowId, driveId, limit } = scope;
  const query = useRunPagesQuery(
    { workflowId, driveId, limit },
    { active, pollMs: POLL_MS },
  );
  const { refetch, fetchNextPage } = query;
  return {
    runs: query.data ? runsOfPages(query.data.pages) : null,
    error:
      query.status === "error"
        ? query.error instanceof Error
          ? query.error.message
          : String(query.error)
        : null,
    reload: () => void refetch(),
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    loadMore: () => void fetchNextPage(),
  };
}
