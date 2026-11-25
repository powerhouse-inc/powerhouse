import type { WorkBreakdownStructureWbsStatusOperations } from "document-models/work-breakdown-structure/v1";
import type { WbsStatus } from "../../gen/types.js";
import {
  InvalidWbsTransitionError,
  TasksNotCompleteError,
} from "../../gen/wbs-status/error.js";

function assertWbs(
  current: WbsStatus,
  allowed: WbsStatus[],
  transition: string,
): void {
  if (!allowed.includes(current)) {
    throw new InvalidWbsTransitionError(
      `Cannot ${transition} from status ${current}.`,
    );
  }
}

export const workBreakdownStructureWbsStatusOperations: WorkBreakdownStructureWbsStatusOperations =
  {
    activateWbsOperation(state) {
      assertWbs(state.status, ["DRAFT"], "activate");
      state.status = "ACTIVE";
    },
    completeWbsOperation(state) {
      assertWbs(state.status, ["ACTIVE"], "complete");
      const incomplete = state.tasks.some(
        (t) => t.status !== "DONE" && t.status !== "DROPPED",
      );
      if (incomplete) {
        throw new TasksNotCompleteError(
          "All tasks must be DONE or DROPPED before the WBS can be completed.",
        );
      }
      state.status = "COMPLETE";
    },
    archiveWbsOperation(state) {
      assertWbs(state.status, ["DRAFT", "ACTIVE", "COMPLETE"], "archive");
      state.status = "ARCHIVED";
    },
    reopenWbsOperation(state) {
      assertWbs(state.status, ["COMPLETE", "ARCHIVED"], "reopen");
      state.status = "ACTIVE";
    },
  };
