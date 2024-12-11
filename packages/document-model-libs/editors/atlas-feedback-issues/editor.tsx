import {
  formatDateForDisplay,
  formatEthAddress,
  WagmiContext,
} from "@powerhousedao/design-system";
import { EditorProps, User, utils } from "document-model/document";
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
import { ADDRESS_ALLOW_LIST } from "document-models/atlas-feedback-issues/src/constants";
import { TextField } from "editors/document-model-2/components/text-field";
import { useCallback, useMemo, useState } from "react";
import { Address } from "viem";
import { useEnsName } from "wagmi";

export default function Editor(
  props: EditorProps<
    AtlasFeedbackIssuesState,
    AtlasFeedbackIssuesAction,
    AtlasFeedbackIssuesLocalState
  >,
) {
  const { document, context, dispatch } = props;
  const { user } = context;
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

  const isLoggedIn = useMemo(() => !!user?.address, [user?.address]);
  const isOnAllowList = useMemo(
    () => !!user && ADDRESS_ALLOW_LIST.includes(user.address),
    [user],
  );
  const hasIssues = useMemo(() => issues.length > 0, [issues]);

  const issuesContent = user ? (
    <div>
      {hasIssues ? (
        issues.map((issue, index) => (
          <Issue
            key={issue.phid}
            issue={issue}
            user={user}
            issueNumber={index + 1}
            handleDeleteIssue={handleDeleteIssue}
            handleCreateComment={handleCreateComment}
            handleDeleteComment={handleDeleteComment}
            handleEditComment={handleEditComment}
          />
        ))
      ) : (
        <div>No issues</div>
      )}
      <button
        onClick={() =>
          handleCreateIssue({ phid: utils.hashKey(), notionIds: [] })
        }
      >
        create issue
      </button>
    </div>
  ) : null;

  return (
    <WagmiContext>
      <main className="min-h-dvh bg-gray-50">
        {isLoggedIn && isOnAllowList ? issuesContent : <Login />}
      </main>
    </WagmiContext>
  );
}

function Login() {
  const handleLogin = useCallback(() => {
    console.log("login");
  }, []);
  return (
    <div>
      <button onClick={() => handleLogin()}>Login</button>
    </div>
  );
}

function Issue(props: {
  issue: TIssue;
  user: User;
  issueNumber: number;
  handleDeleteIssue: (input: DeleteIssueInput) => void;
  handleCreateComment: (input: CreateCommentInput) => void;
  handleDeleteComment: (input: DeleteCommentInput) => void;
  handleEditComment: (input: EditCommentInput) => void;
}) {
  const {
    issue,
    user,
    issueNumber,
    handleDeleteIssue,
    handleCreateComment,
    handleDeleteComment,
    handleEditComment,
  } = props;
  const [selectedNotionId, setSelectedNotionId] = useState<string | null>(
    issue.notionIds[0],
  );
  const [isAddingComment, setIsAddingComment] = useState(false);
  const comments = useMemo(() => issue.comments, [issue.comments]);

  return (
    <div className="w-fit my-4">
      <div className="flex justify-between">
        <p>Issue #{issueNumber}</p>
        <button onClick={() => handleDeleteIssue({ phid: issue.phid })}>
          Delete issue
        </button>
      </div>
      <ul>
        {issue.notionIds.map((notionId) => (
          <li key={notionId}>
            <button onClick={() => setSelectedNotionId(notionId)}>
              {notionId}
            </button>
          </li>
        ))}
      </ul>
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
                  handleEditComment={handleEditComment}
                  handleDeleteComment={handleDeleteComment}
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
          handleCreateComment={handleCreateComment}
        />
      )}
      {isAddingComment ? (
        <button onClick={() => setIsAddingComment(false)}>Cancel</button>
      ) : (
        <button onClick={() => setIsAddingComment(true)}>Add comment</button>
      )}
    </div>
  );
}

function Comment(props: {
  issue: TIssue;
  comment: TComment;
  user: User;
  handleEditComment: (input: EditCommentInput) => void;
  handleDeleteComment: (input: DeleteCommentInput) => void;
}) {
  const { issue, comment, user, handleEditComment, handleDeleteComment } =
    props;
  const [isEdit, setIsEdit] = useState(false);
  const ensNameResult = useEnsName({
    address: comment.creatorAddress as Address,
  });
  const ensName = ensNameResult.data ?? undefined;
  const formattedAddress = formatEthAddress(comment.creatorAddress);
  const displayName = ensName ?? formattedAddress;
  const userIsCreator = user.address === comment.creatorAddress;
  const nameStyle = userIsCreator ? "" : "text-right";
  return (
    <div className="w-fit">
      <p className={nameStyle}>{displayName}</p>
      <p>Created: {formatDateForDisplay(comment.createdAt)}</p>
      <p>Edited: {formatDateForDisplay(comment.lastEditedAt)}</p>
      {isEdit ? (
        <EditCommentForm
          issue={issue}
          comment={comment}
          handleEditComment={handleEditComment}
        />
      ) : (
        <div>
          <p>{comment.content}</p>
          {userIsCreator && (
            <div className="flex gap-2">
              <button onClick={() => setIsEdit(true)}>Edit</button>
              <button
                onClick={() =>
                  handleDeleteComment({
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

function CreateCommentForm(props: {
  issue: TIssue;
  notionId: string;
  handleCreateComment: (input: CreateCommentInput) => void;
}) {
  const { issue, notionId, handleCreateComment } = props;
  const handleSubmit = useCallback(
    (content: string) => {
      handleCreateComment({
        issuePhid: issue.phid,
        phid: utils.hashKey(),
        notionId,
        content,
      });
    },
    [issue.phid, notionId, handleCreateComment],
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
