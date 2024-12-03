/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { IssueSchema } from "document-models/atlas-feedback-issues/gen/schema/zod";
import { AtlasFeedbackIssuesIssuesOperations } from "../../gen/issues/operations";
import { makeIssueValidator, makeDeleteIssueValidator } from "../utils";

function createIssueUrl() {
  return "https://placeholder.com";
}

export const reducer: AtlasFeedbackIssuesIssuesOperations = {
  createIssueOperation(state, action, dispatch) {
    const validator = IssueSchema().merge(makeIssueValidator(state));
    const input = {
      ...action.input,
      creatorAddress: action.context?.signer?.user.address,
      createdAt: new Date().toISOString(),
      threadUrl: createIssueUrl(),
      comments: [],
    };
    const result = validator.safeParse(input);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    state.issues.push(result.data);
  },
  deleteIssueOperation(state, action, dispatch) {
    const validator = makeDeleteIssueValidator(state);
    const result = validator.safeParse(action.input);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    state.issues = state.issues.filter(
      (issue) => issue.phid !== action.input.phid,
    );
  },
};
