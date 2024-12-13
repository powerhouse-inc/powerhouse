import {
  formatDateForDisplay,
  formatEthAddress,
  WagmiContext,
} from "@powerhousedao/design-system";
import { ViewNode } from "@powerhousedao/mips-parser";
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
  AddNotionIdInput,
  RemoveNotionIdInput,
} from "document-models/atlas-feedback-issues";
import { AtlasFeedbackIssuesAction } from "document-models/atlas-feedback-issues";
import { AtlasFeedbackIssuesState } from "document-models/atlas-feedback-issues";
import { ADDRESS_ALLOW_LIST } from "document-models/atlas-feedback-issues/src/constants";
import { TextField } from "editors/document-model-2/components/text-field";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Address } from "viem";
import { useEnsName } from "wagmi";
import { Scopes } from "./components/scopes";
import { dispatchCreateIssueEvent } from "./utils";
import {
  AddNotionIdToIssueEvent,
  CreateIssueEvent,
  eventNames,
  RemoveNotionIdFromIssueEvent,
} from "./utils/events";
import { filterViewNodesRecursively } from "./utils/nodes";

export default function Editor(
  props: EditorProps<
    AtlasFeedbackIssuesState,
    AtlasFeedbackIssuesAction,
    AtlasFeedbackIssuesLocalState
  > & {
    scopes: ViewNode[];
  },
) {
  const { document, context, scopes, dispatch } = props;
  const { user } = context;
  const issues = useMemo(
    () => document.state.global.issues,
    [document.state.global.issues],
  );

  const handleCreateIssue = useCallback(
    (event: CreateIssueEvent) => {
      const { notionIds } = event.detail;
      const input: CreateIssueInput = {
        phid: utils.hashKey(),
        notionIds,
      };
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

  const handleAddNotionId = useCallback(
    (event: AddNotionIdToIssueEvent) => {
      const { notionId, phid } = event.detail;
      const input: AddNotionIdInput = {
        phid,
        notionId,
      };
      dispatch(actions.addNotionId(input));
    },
    [dispatch],
  );

  const handleRemoveNotionId = useCallback(
    (event: RemoveNotionIdFromIssueEvent) => {
      const { notionId, phid } = event.detail;
      const input: RemoveNotionIdInput = {
        phid,
        notionId,
      };
      dispatch(actions.removeNotionId(input));
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

  useEffect(() => {
    window.addEventListener(eventNames.CREATE_ISSUE, handleCreateIssue);
    window.addEventListener(
      eventNames.ADD_NOTION_ID_TO_ISSUE,
      handleAddNotionId,
    );
    window.addEventListener(
      eventNames.REMOVE_NOTION_ID_FROM_ISSUE,
      handleRemoveNotionId,
    );

    return () => {
      window.removeEventListener(eventNames.CREATE_ISSUE, handleCreateIssue);
      window.removeEventListener(
        eventNames.ADD_NOTION_ID_TO_ISSUE,
        handleAddNotionId,
      );
      window.removeEventListener(
        eventNames.REMOVE_NOTION_ID_FROM_ISSUE,
        handleRemoveNotionId,
      );
    };
  }, [handleCreateIssue, handleAddNotionId, handleRemoveNotionId]);

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
            issues={issues}
            user={user}
            issueNumber={index + 1}
            scopes={scopes}
            handleDeleteIssue={handleDeleteIssue}
            handleCreateComment={handleCreateComment}
            handleDeleteComment={handleDeleteComment}
            handleEditComment={handleEditComment}
          />
        ))
      ) : (
        <div>No issues</div>
      )}
      <button onClick={() => dispatchCreateIssueEvent([])}>create issue</button>
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
  const filteredScopes = useMemo(() => {
    return filterViewNodesRecursively(scopes, issue.notionIds);
  }, [scopes, issue.notionIds]);

  console.log(filteredScopes);

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
        scopes={filteredScopes}
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

function Comment(props: {
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

function CreateCommentForm(props: {
  issue: TIssue;
  notionId: string;
  onSubmit: (input: CreateCommentInput) => void;
  onCancel: () => void;
}) {
  const { issue, notionId, onSubmit, onCancel } = props;
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

function EditCommentForm(props: {
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
