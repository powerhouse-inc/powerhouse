import { EditorProps, utils } from "document-model/document";
import {
  AtlasFeedbackIssuesLocalState,
  Issue as TIssue,
  Comment as TComment,
  actions,
  CreateIssueInput,
  DeleteIssueInput,
  CreateCommentInput,
  DeleteCommentInput,
  EditCommentInput,
} from "document-models/atlas-feedback-issues";
import { AtlasFeedbackIssuesAction } from "document-models/atlas-feedback-issues";
import { AtlasFeedbackIssuesState } from "document-models/atlas-feedback-issues";
import { TextField } from "editors/document-model-2/components/text-field";
import { useCallback, useMemo, useState } from "react";

export default function Editor(
  props: EditorProps<
    AtlasFeedbackIssuesState,
    AtlasFeedbackIssuesAction,
    AtlasFeedbackIssuesLocalState
  >,
) {
  const { document, dispatch } = props;
  const issues = useMemo(
    () => document.state.global.issues,
    [document.state.global.issues],
  );

  const handleCreateIssue = useCallback(
    (input: CreateIssueInput) => {
      dispatch(actions.createIssue(input));
    },
    [dispatch],
  );

  const handleDeleteIssue = useCallback(
    (input: DeleteIssueInput) => {
      dispatch(actions.deleteIssue(input));
    },
    [dispatch],
  );

  const handleCreateComment = useCallback(
    (input: CreateCommentInput) => {
      dispatch(actions.createComment(input));
    },
    [dispatch],
  );

  const handleDeleteComment = useCallback(
    (input: DeleteCommentInput) => {
      dispatch(actions.deleteComment(input));
    },
    [dispatch],
  );

  const handleEditComment = useCallback(
    (input: EditCommentInput) => {
      dispatch(actions.editComment(input));
    },
    [dispatch],
  );

  return (
    <main className="min-h-dvh bg-gray-50">
      {issues.length ? (
        issues.map((issue) => (
          <Issue
            key={issue.phid}
            issue={issue}
            handleDeleteIssue={handleDeleteIssue}
            handleCreateComment={handleCreateComment}
            handleDeleteComment={handleDeleteComment}
            handleEditComment={handleEditComment}
          />
        ))
      ) : (
        <div>No issues</div>
      )}
    </main>
  );
}

function Issue(props: {
  issue: TIssue;
  handleDeleteIssue: (input: DeleteIssueInput) => void;
  handleCreateComment: (input: CreateCommentInput) => void;
  handleDeleteComment: (input: DeleteCommentInput) => void;
  handleEditComment: (input: EditCommentInput) => void;
}) {
  const {
    issue,
    handleDeleteIssue,
    handleCreateComment,
    handleDeleteComment,
    handleEditComment,
  } = props;
  const [selectedNotionId, setSelectedNotionId] = useState<string | null>(null);
  const comments = useMemo(() => issue.comments, [issue.comments]);

  return (
    <div>
      <button onClick={() => handleDeleteIssue({ phid: issue.phid })}>
        Delete issue
      </button>
      {comments.length ? (
        comments.map((comment) => (
          <Comment
            key={comment.phid}
            issue={issue}
            comment={comment}
            handleEditComment={handleEditComment}
            handleDeleteComment={handleDeleteComment}
          />
        ))
      ) : (
        <div>No comments</div>
      )}
      {selectedNotionId ? (
        <CreateCommentForm
          key="new-comment"
          issue={issue}
          relevantNotionId={selectedNotionId}
          handleCreateComment={handleCreateComment}
        />
      ) : (
        <ul>
          {issue.relevantNotionIds.map((relevantNotionId) => (
            <li key={relevantNotionId}>
              <button onClick={() => setSelectedNotionId(relevantNotionId)}>
                {relevantNotionId}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Comment(props: {
  issue: TIssue;
  comment: TComment;
  handleEditComment: (input: EditCommentInput) => void;
  handleDeleteComment: (input: DeleteCommentInput) => void;
}) {
  const { issue, comment, handleEditComment, handleDeleteComment } = props;
  const [isEdit, setIsEdit] = useState(false);
  return (
    <div>
      <button
        onClick={() =>
          handleDeleteComment({ issuePhid: issue.phid, phid: comment.phid })
        }
      >
        Delete
      </button>
      <p>{comment.creatorAddress}</p>
      <p>Created: {comment.createdAt}</p>
      <p>Edited: {comment.lastEditedAt}</p>
      {isEdit ? (
        <div>
          <p>{comment.content}</p>
          <button onClick={() => setIsEdit(true)}>Edit</button>
        </div>
      ) : (
        <EditCommentForm
          issue={issue}
          comment={comment}
          handleEditComment={handleEditComment}
        />
      )}
    </div>
  );
}

function CreateCommentForm(props: {
  issue: TIssue;
  relevantNotionId: string;
  handleCreateComment: (input: CreateCommentInput) => void;
}) {
  const { issue, relevantNotionId, handleCreateComment } = props;
  const handleSubmit = useCallback(
    (content: string) => {
      handleCreateComment({
        issuePhid: issue.phid,
        phid: utils.hashKey(),
        relevantNotionId,
        content,
      });
    },
    [issue.phid, relevantNotionId, handleCreateComment],
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

function EditCommentForm(props: {
  issue: TIssue;
  comment: TComment;
  handleEditComment: (input: EditCommentInput) => void;
}) {
  const { issue, comment, handleEditComment } = props;

  const handleSubmit = useCallback(
    (content: string) => {
      handleEditComment({ issuePhid: issue.phid, phid: comment.phid, content });
    },
    [issue.phid, comment.phid, handleEditComment],
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
