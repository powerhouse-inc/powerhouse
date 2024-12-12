import { utils } from "document-model/document";
import {
  Issue as TIssue,
  CreateCommentInput,
} from "document-models/atlas-feedback-issues";
import { TextField } from "editors/document-model-2/components/text-field";
import { useCallback } from "react";

export function CreateCommentForm(props: {
  issue: TIssue;
  notionId: string;
  onSubmit: (input: CreateCommentInput) => void;
  onCancel: () => void;
}) {
  const { issue, notionId, onSubmit } = props;
  const handleSubmit = useCallback(
    (content: string) => {
      onSubmit({
        issuePhid: issue.phid,
        phid: utils.hashKey(),
        notionId,
        content,
      });
    },
    [issue.phid, notionId, onSubmit],
  );
  return (
    <TextField
      name="content"
      value={null}
      label="Add comment"
      onSubmit={handleSubmit}
      placeholder="Add comment"
      required={true}
      shouldReset={true}
      allowEmpty={false}
    />
  );
}
