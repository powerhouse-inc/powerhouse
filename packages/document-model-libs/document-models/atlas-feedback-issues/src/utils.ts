import { makeStringExistsValidator, makeUniqueStringValidator } from "utils";
import { z } from "zod";
import { AtlasFeedbackIssuesState } from "../gen";

export function makeIssueValidator(state: AtlasFeedbackIssuesState) {
  return z.object({
    phid: makeUniqueStringValidator(
      state.issues.map((issue) => issue.phid),
      "Issue with this phid already exists",
    ),
  })
}

export function makeDeleteIssueValidator(state: AtlasFeedbackIssuesState) {
  return z.object({
    phid: makeStringExistsValidator(
      state.issues.map((issue) => issue.phid),
      "Issue with this phid does not exist",
    ),
  });
}

export function makeNewCommentValidator(state: AtlasFeedbackIssuesState) {
  return z.object({
    issuePhid: makeStringExistsValidator(
      state.issues.map((issue) => issue.phid),
      "Issue with this phid does not exist",
    ),
    phid: makeUniqueStringValidator(
      state.issues.flatMap((issue) => issue.comments.map((c) => c.phid)),
      "Comment with this phid already exists",
    ),
  });
}

export function makeExistingCommentValidator(state: AtlasFeedbackIssuesState) {
  return z.object({
    issuePhid: makeStringExistsValidator(
      state.issues.map((issue) => issue.phid),
      "Issue with this phid does not exist",
    ),
    phid: makeStringExistsValidator(
      state.issues.flatMap((issue) => issue.comments.map((c) => c.phid)),
      "Comment with this phid does not exist",
    ),
  });
}