import { ViewNode } from "@powerhousedao/mips-parser";
import { User } from "document-model/document";
import {
  Issue as TIssue,
  DeleteIssueInput,
  CreateCommentInput,
  DeleteCommentInput,
  EditCommentInput,
} from "document-models/atlas-feedback-issues";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Scopes } from "./scopes";
import { Comment } from "./comment";
import { CreateCommentForm } from "./create-comment-form";

export function Issue(props: {
  issue: TIssue;
  issueNumber: number;
  issues: TIssue[];
  user: User;
  scopes: ViewNode[];
  handleDeleteIssue: (input: DeleteIssueInput) => void;
  handleCreateComment: (input: CreateCommentInput) => void;
  handleDeleteComment: (input: DeleteCommentInput) => void;
  handleEditComment: (input: EditCommentInput) => void;
}) {
  const {
    issue,
    issues,
    user,
    issueNumber,
    scopes,
    handleDeleteIssue,
    handleCreateComment,
    handleDeleteComment,
    handleEditComment,
  } = props;
  const [selectedNotionId, setSelectedNotionId] = useState<string | undefined>(
    issue.notionIds[0],
  );
  const [isAddingComment, setIsAddingComment] = useState(false);
  const comments = useMemo(() => issue.comments, [issue.comments]);
  const hasNotionIds = useMemo(
    () => !!issue.notionIds.length,
    [issue.notionIds],
  );

  useEffect(() => {
    if (selectedNotionId) return;
    setSelectedNotionId(issue.notionIds[0]);
  }, [issue.notionIds, selectedNotionId]);

  const onSelectNotionId = useCallback((notionId: string) => {
    setSelectedNotionId(notionId);
  }, []);

  const onSubmitCreateComment = useCallback(
    (input: CreateCommentInput) => {
      handleCreateComment(input);
      setIsAddingComment(false);
    },
    [handleCreateComment],
  );

  const onSubmitEditComment = useCallback(
    (input: EditCommentInput) => {
      handleEditComment(input);
      setIsAddingComment(false);
    },
    [handleEditComment],
  );

  const onCancelComment = useCallback(() => {
    setIsAddingComment(false);
  }, []);

  return (
    <div className="my-4 w-fit">
      <div className="flex justify-between">
        <p>Issue #{issueNumber}</p>
        <button onClick={() => handleDeleteIssue({ phid: issue.phid })}>
          Delete issue
        </button>
      </div>
      <Scopes
        scopes={scopes}
        issue={issue}
        issues={issues}
        onSelectNotionId={onSelectNotionId}
      />
      {comments.length ? (
        <ul>
          {comments
            .filter((c) => c.notionId === selectedNotionId)
            .map((comment) => (
              <li key={comment.phid} className="my-2">
                <Comment
                  issue={issue}
                  comment={comment}
                  user={user}
                  onSubmitEditComment={onSubmitEditComment}
                  onDeleteComment={handleDeleteComment}
                />
              </li>
            ))}
        </ul>
      ) : (
        <div>No comments</div>
      )}
      {isAddingComment && !!selectedNotionId && (
        <CreateCommentForm
          key="new-comment"
          issue={issue}
          notionId={selectedNotionId}
          onSubmit={onSubmitCreateComment}
          onCancel={onCancelComment}
        />
      )}
      {hasNotionIds && (
        <>
          {isAddingComment ? (
            <button onClick={onCancelComment}>Cancel</button>
          ) : (
            <button onClick={() => setIsAddingComment(true)}>
              Add comment
            </button>
          )}
        </>
      )}
    </div>
  );
}
