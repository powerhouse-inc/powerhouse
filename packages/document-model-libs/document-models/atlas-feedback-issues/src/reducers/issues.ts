/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { IssueSchema } from "document-models/atlas-feedback-issues/gen/schema/zod";
import { AtlasFeedbackIssuesIssuesOperations } from "../../gen/issues/operations";
import { makeIssueValidator, makeDeleteIssueValidator } from "../utils";
import { ADDRESS_ALLOW_LIST } from "../constants";
import {
  makeUniqueStringValidator,
  makeStringExistsValidator,
} from "document-model-libs/utils";

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
      throw new Error("Issue with this phid does not exist");
    }
    if (issue.creatorAddress !== creatorAddress) {
      throw new Error("User is not the creator of this issue");
    }
    state.issues = state.issues.filter((i) => i.phid !== issue.phid);
  },
  addNotionIdOperation(state, action, dispatch) {
    const creatorAddress = action.context?.signer?.user.address;
    if (!creatorAddress) {
      throw new Error("User is not signed in");
    }
    if (!ADDRESS_ALLOW_LIST.includes(creatorAddress)) {
      throw new Error("User is not allowed to add notion IDs");
    }

    const issue = state.issues.find(
      (issue) => issue.phid === action.input.phid,
    );
    if (!issue) {
      throw new Error("Issue with this phid does not exist");
    }

    const allNotionIds = state.issues.flatMap((issue) => issue.notionIds);
    const validator = makeUniqueStringValidator(
      allNotionIds,
      "This Notion ID is already linked to another issue",
    );
    const result = validator.safeParse(action.input.notionId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    issue.notionIds = [...issue.notionIds, action.input.notionId];
    state.issues = state.issues.map((i) => (i.phid === issue.phid ? issue : i));
  },
  removeNotionIdOperation(state, action, dispatch) {
    const creatorAddress = action.context?.signer?.user.address;
    if (!creatorAddress) {
      throw new Error("User is not signed in");
    }
    if (!ADDRESS_ALLOW_LIST.includes(creatorAddress)) {
      throw new Error("User is not allowed to remove notion IDs");
    }

    const issue = state.issues.find(
      (issue) => issue.phid === action.input.phid,
    );
    if (!issue) {
      throw new Error("Issue with this phid does not exist");
    }

    const validator = makeStringExistsValidator(
      issue.notionIds,
      "This Notion ID does not exist on this issue",
    );
    const result = validator.safeParse(action.input.notionId);

    if (!result.success) {
      throw new Error(result.error.message);
    }

    issue.notionIds = issue.notionIds.filter(
      (id) => id !== action.input.notionId,
    );
    state.issues = state.issues.map((i) => (i.phid === issue.phid ? issue : i));
  },
};
