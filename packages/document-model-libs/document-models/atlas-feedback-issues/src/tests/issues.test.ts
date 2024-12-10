/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";

import utils from "../../gen/utils";
import { z, CreateIssueInput, DeleteIssueInput } from "../../gen/schema";
import { reducer } from "../../gen/reducer";
import * as creators from "../../gen/issues/creators";
import { ActionContext } from "document-model/document";
import { ADDRESS_ALLOW_LIST } from "../constants";
import { beforeEach } from "vitest";
import { AtlasFeedbackIssuesDocument } from "document-models/atlas-feedback-issues/gen/types";

describe("Issues Operations", () => {
  let document: AtlasFeedbackIssuesDocument;

  beforeEach(({ task }) => {
    document = utils.createDocument(
      utils.createExtendedState({
        state: {
          global: {
            issues: [],
          },
          local: {},
        },
      }),
    );
    const otherDocument = utils.createDocument();
    console.log(
      task.name,
      document.state.global.issues.length,
      otherDocument.state.global.issues.length,
    );
  });

  it("should handle createIssue operation", () => {
    const input: CreateIssueInput = generateMock(z.CreateIssueInputSchema());

    const updatedDocument = reducer(document, creators.createIssue(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("CREATE_ISSUE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should require user address to create issue", () => {
    const input: CreateIssueInput = generateMock(z.CreateIssueInputSchema());
    const creator = creators.createIssue(input);
    const context: ActionContext = {
      signer: undefined,
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not signed in");
  });
  it("should require user address to be on allow list to create issue", () => {
    const input: CreateIssueInput = generateMock(z.CreateIssueInputSchema());
    const creator = creators.createIssue(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: "0x123",
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "Atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not allowed to submit issues");
  });
  it("should create issue when user address is on allow list", () => {
    const input: CreateIssueInput = generateMock(z.CreateIssueInputSchema());
    const creator = creators.createIssue(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "Atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeUndefined();
    expect(updatedDocument.state.global.issues).toHaveLength(1);
    expect(updatedDocument.state.global.issues[0].creatorAddress).toBe(
      ADDRESS_ALLOW_LIST[0],
    );
  });
  it("should handle deleteIssue operation", () => {
    const input: DeleteIssueInput = generateMock(z.DeleteIssueInputSchema());

    const updatedDocument = reducer(document, creators.deleteIssue(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("DELETE_ISSUE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should require user to be signed in to delete issue", () => {
    const input: DeleteIssueInput = generateMock(z.DeleteIssueInputSchema());
    const creator = creators.deleteIssue(input);
    const context: ActionContext = {
      signer: undefined,
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not signed in");
  });
  it("should require user address to be on allow list to delete issue", () => {
    const input: DeleteIssueInput = generateMock(z.DeleteIssueInputSchema());
    const creator = creators.deleteIssue(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: "0x123",
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "Atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not allowed to delete issues");
  });
  it("should require issue with input phid to be found in document", () => {
    const input: DeleteIssueInput = generateMock(z.DeleteIssueInputSchema());
    const creator = creators.deleteIssue(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "Atlas",
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
  it("should require user to be the creator of the issue to delete it", () => {
    const issue = generateMock(z.IssueSchema());
    document.state.global.issues.push(issue);
    const input: DeleteIssueInput = generateMock(z.DeleteIssueInputSchema());
    input.phid = issue.phid;
    const creator = creators.deleteIssue(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: ADDRESS_ALLOW_LIST[0],
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "Atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);
    const operation = updatedDocument.operations.global[0];
    expect(operation.error).toBeDefined();
    expect(operation.error).toContain("User is not the creator of this issue");
  });
  it("should delete issue when user is the creator of the issue", () => {
    const issue = generateMock(z.IssueSchema());
    issue.creatorAddress = ADDRESS_ALLOW_LIST[0];
    document.state.global.issues.push(issue);

    const initialIssueCount = document.state.global.issues.length;
    expect(initialIssueCount).toBe(1);

    const input: DeleteIssueInput = generateMock(z.DeleteIssueInputSchema());
    input.phid = issue.phid;
    const creator = creators.deleteIssue(input);
    const context: ActionContext = {
      signer: {
        user: {
          address: issue.creatorAddress,
          networkId: "1",
          chainId: 1,
        },
        app: {
          name: "Atlas",
          key: "atlas",
        },
        signatures: [],
      },
    };
    const action = { ...creator, context };
    const updatedDocument = reducer(document, action);

    // After deletion, we should have 0 issues
    expect(updatedDocument.state.global.issues).toHaveLength(0);
  });
});
