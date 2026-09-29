// How the workflow editor's undo treats the runtime's facts.
import type { Action } from "@powerhousedao/shared/document-model";
import { actions as workflowActions } from "document-models/workflow";
import type { UndoPolicy } from "../shared/undo-plan.js";

// Whether an edit adds the block `id`, or sets the trigger it names.
function placesBlock(edit: Action, id: string): boolean {
  if (edit.type !== "ADD_STEP" && edit.type !== "SET_TRIGGER") return false;
  return (edit.input as { id?: unknown } | undefined)?.id === id;
}

// Undo passes over the runtime's facts and writes them again, so undoing an
// edit never loses a test or a run. A test of a block the undo removes goes.
export const WORKFLOW_UNDO: UndoPolicy = {
  skip: new Set(["SET_LAST_TEST", "SET_LAST_RUN"]),
  replay: (action, undone) => {
    if (action.type === "SET_LAST_TEST") {
      const input = action.input as Parameters<
        typeof workflowActions.setLastTest
      >[0];
      return undone.some((edit) => placesBlock(edit, input.id))
        ? undefined
        : workflowActions.setLastTest(input);
    }
    if (action.type === "SET_LAST_RUN") {
      return workflowActions.setLastRun(
        action.input as Parameters<typeof workflowActions.setLastRun>[0],
      );
    }
    return undefined;
  },
};
