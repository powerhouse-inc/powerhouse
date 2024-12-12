import {
  Issue as TIssue,
  Comment as TComment,
  EditCommentInput,
} from "document-models/atlas-feedback-issues";
import { TextField } from "editors/document-model-2/components/text-field";
import { useCallback } from "react";

export function EditCommentForm(props: {
  issue: TIssue;
  comment: TComment;
  onSubmit: (input: EditCommentInput) => void;
}) {
  const { issue, comment, onSubmit } = props;

  const handleSubmit = useCallback(
    (content: string) => {
      onSubmit({ issuePhid: issue.phid, phid: comment.phid, content });
    },
    [issue.phid, comment.phid, onSubmit],
  );

  return (
    <TextField
      name="content"
      value={comment.content}
      label="Edit comment"
      onSubmit={handleSubmit}
      placeholder="Edit comment"
      required={true}
      shouldReset={false}
      allowEmpty={false}
    />
  );
}
