/**
 * This is a scaffold file meant for customization:
 * - modify it by implementing the reducer functions
 * - delete the file and run the code generator again to have it reset
 */

import { AtlasFeedbackIssuesCommentsOperations } from "../../gen/comments/operations";
import {
  CommentSchema,
  EditCommentInputSchema,
} from "document-models/atlas-feedback-issues/gen/schema/zod";
import {
  makeExistingCommentValidator,
  makeNewCommentValidator,
} from "../utils";

export const reducer: AtlasFeedbackIssuesCommentsOperations = {
  createCommentOperation(state, action, dispatch) {
    const validator = CommentSchema().merge(makeNewCommentValidator(state));
    const input = {
      ...action.input,
      createdAt: new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
      creatorAddress: action.context?.signer?.user.address,
    };
    const result = validator.safeParse(input);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    const issue = state.issues.find(
      (issue) => issue.phid === action.input.issuePhid,
    );
    if (!issue) {
      throw new Error("Issue not found");
    }
    issue.comments.push(result.data);
    state.issues = state.issues.map((issue) =>
      issue.phid === action.input.issuePhid ? issue : issue,
    );
  },
  deleteCommentOperation(state, action, dispatch) {
    const validator = CommentSchema().merge(
      makeExistingCommentValidator(state),
    );
    const result = validator.safeParse(action.input);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    const issue = state.issues.find(
      (issue) => issue.phid === action.input.issuePhid,
    );
    if (!issue) {
      throw new Error("Issue not found");
    }
    issue.comments = issue.comments.filter((c) => c.phid !== action.input.phid);
    state.issues = state.issues.map((issue) =>
      issue.phid === action.input.issuePhid ? issue : issue,
    );
  },
  editCommentOperation(state, action, dispatch) {
    const validator = EditCommentInputSchema().merge(
      makeExistingCommentValidator(state),
    );
    const result = validator.safeParse(action.input);
    if (!result.success) {
      throw new Error(result.error.message);
    }
    const issue = state.issues.find(
      (issue) => issue.phid === action.input.issuePhid,
    );
    if (!issue) {
      throw new Error("Issue not found");
    }
    const comment = issue.comments.find(
      (comment) => comment.phid === action.input.phid,
    );
    if (!comment) {
      throw new Error("Comment not found");
    }
    comment.content = result.data.content ?? comment.content;
    comment.relevantNotionId =
      result.data.relevantNotionId ?? comment.relevantNotionId;
    comment.lastEditedAt = new Date().toISOString();
    issue.comments = issue.comments.map((c) =>
      c.phid === action.input.phid ? comment : c,
    );
    state.issues = state.issues.map((issue) =>
      issue.phid === action.input.issuePhid ? issue : issue,
    );
  },
};
