import {
  formatDateForDisplay,
  formatEthAddress,
} from "@powerhousedao/design-system";
import { User } from "document-model/document";
import {
  Issue as TIssue,
  Comment as TComment,
  EditCommentInput,
  DeleteCommentInput,
} from "document-models/atlas-feedback-issues";
import { useCallback, useState } from "react";
import { Address } from "viem";
import { useEnsName } from "wagmi";
import { EditCommentForm } from "./edit-comment-form";

export function Comment(props: {
  issue: TIssue;
  comment: TComment;
  user: User;
  onSubmitEditComment: (input: EditCommentInput) => void;
  onDeleteComment: (input: DeleteCommentInput) => void;
}) {
  const { issue, comment, user, onSubmitEditComment, onDeleteComment } = props;
  const [isEdit, setIsEdit] = useState(false);
  const ensNameResult = useEnsName({
    address: comment.creatorAddress as Address,
  });
  const ensName = ensNameResult.data ?? undefined;
  const formattedAddress = formatEthAddress(comment.creatorAddress);
  const displayName = ensName ?? formattedAddress;
  const userIsCreator = user.address === comment.creatorAddress;
  const onSubmit = useCallback(
    (input: EditCommentInput) => {
      onSubmitEditComment(input);
      setIsEdit(false);
    },
    [onSubmitEditComment],
  );

  return (
    <div className="w-fit">
      {!userIsCreator && <p>{displayName}</p>}
      <p>Created: {formatDateForDisplay(comment.createdAt)}</p>
      <p>Edited: {formatDateForDisplay(comment.lastEditedAt)}</p>
      {isEdit ? (
        <div>
          <EditCommentForm
            issue={issue}
            comment={comment}
            onSubmit={onSubmit}
          />
          <button onClick={() => setIsEdit(false)}>Cancel</button>
        </div>
      ) : (
        <div>
          <p>{comment.content}</p>
          {userIsCreator && (
            <div className="flex gap-2">
              <button onClick={() => setIsEdit(true)}>Edit</button>
              <button
                onClick={() =>
                  onDeleteComment({
                    issuePhid: issue.phid,
                    phid: comment.phid,
                  })
                }
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
