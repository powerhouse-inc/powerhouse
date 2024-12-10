/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { ActionContext } from "document-model/document";

import utils from "../../gen/utils";
import {
  z,
  CreateCommentInput,
  DeleteCommentInput,
  EditCommentInput,
} from "../../gen/schema";
import { reducer } from "../../gen/reducer";
import * as creators from "../../gen/comments/creators";
import { AtlasFeedbackIssuesDocument } from "../../gen/types";
import { ADDRESS_ALLOW_LIST } from "../constants";

describe("Comments Operations", () => {
  let document: AtlasFeedbackIssuesDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle createComment operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: CreateCommentInput = generateMock(
      z.CreateCommentInputSchema(),
    );

    const updatedDocument = reducer(document, creators.createComment(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("CREATE_COMMENT");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should require user to be signed in to create comment", () => {
    const issue = generateMock(z.IssueSchema());
    issue.creatorAddress = ADDRESS_ALLOW_LIST[0];
    document.state.global.issues = [issue];

    const input: CreateCommentInput = generateMock(
      z.CreateCommentInputSchema(),
    );
    const creator = creators.createComment(input);
    const context = {
      signer: undefined,
    };
    const action = { ...creator, context };
    const issuePreviousCommentCount = issue.comments.length;
    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (issue) => issue.phid === issue.phid,
    );
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not signed in");
    expect(updatedIssue?.comments.length).toBe(issuePreviousCommentCount);
  });
  it("should require user address to be in allow list to create comment", () => {
    const issue = generateMock(z.IssueSchema());
    issue.creatorAddress = ADDRESS_ALLOW_LIST[0];
    document.state.global.issues = [issue];
    const input: CreateCommentInput = generateMock(
      z.CreateCommentInputSchema(),
    );
    const creator = creators.createComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: "0x1234567890",
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const issuePreviousCommentCount = issue.comments.length;
    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (issue) => issue.phid === issue.phid,
    );
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not allowed to submit comments");
    expect(updatedIssue?.comments.length).toBe(issuePreviousCommentCount);
  });
  it("should require issue for comment to exist", () => {
    const input: CreateCommentInput = generateMock(
      z.CreateCommentInputSchema(),
    );
    const creator = creators.createComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("Issue with this phid does not exist");
  });
  it("should create comment when requirements are met", () => {
    const issue = generateMock(z.IssueSchema());
    issue.creatorAddress = ADDRESS_ALLOW_LIST[0];
    document.state.global.issues = [issue];

    const input: CreateCommentInput = generateMock(
      z.CreateCommentInputSchema(),
    );
    input.issuePhid = issue.phid;
    const creator = creators.createComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const issuePreviousCommentCount = issue.comments.length;
    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (issue) => issue.phid === issue.phid,
    );
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeUndefined();
    expect(updatedIssue?.comments.length).toBe(issuePreviousCommentCount + 1);
  });
  it("should handle deleteComment operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: DeleteCommentInput = generateMock(
      z.DeleteCommentInputSchema(),
    );

    const updatedDocument = reducer(document, creators.deleteComment(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("DELETE_COMMENT");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle editComment operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: EditCommentInput = generateMock(z.EditCommentInputSchema());

    const updatedDocument = reducer(document, creators.editComment(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("EDIT_COMMENT");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should require user to be signed in to delete comment", () => {
    const issue = generateMock(z.IssueSchema());
    const comment = generateMock(z.CommentSchema());
    issue.comments = [comment];
    document.state.global.issues = [issue];

    const input: DeleteCommentInput = generateMock(
      z.DeleteCommentInputSchema(),
    );
    input.issuePhid = issue.phid;
    input.phid = comment.phid;

    const creator = creators.deleteComment(input);
    const context = {
      signer: undefined,
    };
    const action = { ...creator, context };
    const issuePreviousCommentCount = issue.comments.length;

    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (i) => i.phid === issue.phid,
    );
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not signed in");
    expect(updatedIssue?.comments.length).toBe(issuePreviousCommentCount);
  });

  it("should require user address to be in allow list to delete comment", () => {
    const issue = generateMock(z.IssueSchema());
    const comment = generateMock(z.CommentSchema());
    issue.comments = [comment];
    document.state.global.issues = [issue];

    const input: DeleteCommentInput = generateMock(
      z.DeleteCommentInputSchema(),
    );
    input.issuePhid = issue.phid;
    input.phid = comment.phid;

    const creator = creators.deleteComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: "0x1234567890",
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const issuePreviousCommentCount = issue.comments.length;

    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (i) => i.phid === issue.phid,
    );
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not allowed to delete comments");
    expect(updatedIssue?.comments.length).toBe(issuePreviousCommentCount);
  });

  it("should require issue to exist for comment deletion", () => {
    const input: DeleteCommentInput = generateMock(
      z.DeleteCommentInputSchema(),
    );

    const creator = creators.deleteComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("Issue with this phid does not exist");
  });

  it("should require comment to exist for deletion", () => {
    const issue = generateMock(z.IssueSchema());
    issue.comments = [];
    document.state.global.issues = [issue];

    const input: DeleteCommentInput = generateMock(
      z.DeleteCommentInputSchema(),
    );
    input.issuePhid = issue.phid;

    const creator = creators.deleteComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("Comment with this phid does not exist");
  });

  it("should delete comment when requirements are met", () => {
    const issue = generateMock(z.IssueSchema());
    const comment = generateMock(z.CommentSchema());
    comment.creatorAddress = ADDRESS_ALLOW_LIST[0];
    issue.comments = [comment];
    document.state.global.issues = [issue];

    const input: DeleteCommentInput = generateMock(
      z.DeleteCommentInputSchema(),
    );
    input.issuePhid = issue.phid;
    input.phid = comment.phid;

    const creator = creators.deleteComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const issuePreviousCommentCount = issue.comments.length;
    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (i) => i.phid === issue.phid,
    );
    expect(updatedIssue?.comments.length).toBe(issuePreviousCommentCount - 1);
  });

  it("should require user to be signed in to edit comment", () => {
    const issue = generateMock(z.IssueSchema());
    const comment = generateMock(z.CommentSchema());
    const originalContent = comment.content;
    issue.comments = [comment];
    document.state.global.issues = [issue];

    const input: EditCommentInput = generateMock(z.EditCommentInputSchema());
    input.issuePhid = issue.phid;
    input.phid = comment.phid;
    input.content = "Updated content";

    const creator = creators.editComment(input);
    const context = {
      signer: undefined,
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (i) => i.phid === issue.phid,
    );
    const updatedComment = updatedIssue?.comments.find(
      (c) => c.phid === comment.phid,
    );
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not signed in");
    expect(updatedComment?.content).toBe(originalContent);
  });

  it("should require user address to be in allow list to edit comment", () => {
    const issue = generateMock(z.IssueSchema());
    const comment = generateMock(z.CommentSchema());
    const originalContent = comment.content;
    issue.comments = [comment];
    document.state.global.issues = [issue];

    const input: EditCommentInput = generateMock(z.EditCommentInputSchema());
    input.issuePhid = issue.phid;
    input.phid = comment.phid;
    input.content = "Updated content";

    const creator = creators.editComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: "0x1234567890",
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (i) => i.phid === issue.phid,
    );
    const updatedComment = updatedIssue?.comments.find(
      (c) => c.phid === comment.phid,
    );
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not allowed to edit comments");
    expect(updatedComment?.content).toBe(originalContent);
  });

  it("should require issue to exist for comment editing", () => {
    const input: EditCommentInput = generateMock(z.EditCommentInputSchema());

    const creator = creators.editComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("Issue with this phid does not exist");
  });

  it("should require comment to exist for editing", () => {
    const issue = generateMock(z.IssueSchema());
    issue.comments = [];
    document.state.global.issues = [issue];

    const input: EditCommentInput = generateMock(z.EditCommentInputSchema());
    input.issuePhid = issue.phid;

    const creator = creators.editComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("Comment with this phid does not exist");
  });

  it("should require user to be comment creator to edit comment", () => {
    const issue = generateMock(z.IssueSchema());
    const comment = generateMock(z.CommentSchema());
    comment.creatorAddress = "0x1234567890"; // Different address
    const originalContent = comment.content;
    issue.comments = [comment];
    document.state.global.issues = [issue];

    const input: EditCommentInput = generateMock(z.EditCommentInputSchema());
    input.issuePhid = issue.phid;
    input.phid = comment.phid;
    input.content = "Updated content";

    const creator = creators.editComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (i) => i.phid === issue.phid,
    );
    const updatedComment = updatedIssue?.comments.find(
      (c) => c.phid === comment.phid,
    );
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeDefined();
    expect(operation.error).toContain(
      "User is not allowed to edit this comment",
    );
    expect(updatedComment?.content).toBe(originalContent);
  });

  it("should edit comment when requirements are met", () => {
    const issue = generateMock(z.IssueSchema());
    const comment = generateMock(z.CommentSchema());
    comment.creatorAddress = ADDRESS_ALLOW_LIST[0];
    const originalContent = comment.content;
    issue.comments = [comment];
    document.state.global.issues = [issue];

    const input: EditCommentInput = generateMock(z.EditCommentInputSchema());
    input.issuePhid = issue.phid;
    input.phid = comment.phid;
    input.content = "Updated content";

    const creator = creators.editComment(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };

    const updatedDocument = reducer(document, action);
    const updatedIssue = updatedDocument.state.global.issues.find(
      (i) => i.phid === issue.phid,
    );
    const updatedComment = updatedIssue?.comments.find(
      (c) => c.phid === comment.phid,
    );
    const operation = updatedDocument.operations.global[0];

    expect(operation.error).toBeUndefined();
    expect(updatedComment?.content).toBe(input.content);
    expect(updatedComment?.content).not.toBe(originalContent);
  });
});
