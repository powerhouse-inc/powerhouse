/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { IssueSchema } from "document-models/atlas-feedback-issues/gen/schema/zod";
import { AtlasFeedbackIssuesIssuesOperations } from "../../gen/issues/operations";
import { makeIssueValidator, makeDeleteIssueValidator } from "../utils";
import { ADDRESS_ALLOW_LIST } from "../constants";

export const reducer: AtlasFeedbackIssuesIssuesOperations = {
  createIssueOperation(state, action, dispatch) {
    const creatorAddress = action.context?.signer?.user.address;
    if (!creatorAddress) {
      throw new Error("User is not signed in");
    }
    if (!ADDRESS_ALLOW_LIST.includes(creatorAddress)) {
      throw new Error("User is not allowed to submit issues");
    }
    const validator = IssueSchema().merge(makeIssueValidator(state));
    const input = {
      ...action.input,
      creatorAddress,
      createdAt: new Date().toISOString(),
      comments: [],
    };
    const result = validator.safeParse(input);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    state.issues.push(result.data);
  },
  deleteIssueOperation(state, action, dispatch) {
    const creatorAddress = action.context?.signer?.user.address;
    if (!creatorAddress) {
      throw new Error("User is not signed in");
    }
    if (!ADDRESS_ALLOW_LIST.includes(creatorAddress)) {
      throw new Error("User is not allowed to delete issues");
    }
    const validator = makeDeleteIssueValidator(state);
    const result = validator.safeParse(action.input);
    if (!result.success) {
      console.log(result.error);
      throw new Error(result.error.message);
    }
    const issue = state.issues.find(
      (issue) => issue.phid === action.input.phid,
    );
    if (!issue) {
      throw new Error("Issue not found");
    }
    if (issue.creatorAddress !== creatorAddress) {
      throw new Error("User is not the creator of this issue");
    }
    state.issues = state.issues.filter(
      (issue) => issue.phid !== action.input.phid,
    );
  },
};
