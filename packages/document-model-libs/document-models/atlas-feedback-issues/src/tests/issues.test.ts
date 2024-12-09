/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";

import utils from "../../gen/utils";
import { z, CreateIssueInput, DeleteIssueInput } from "../../gen/schema";
import { reducer } from "../../gen/reducer";
import * as creators from "../../gen/issues/creators";
import { AtlasFeedbackIssuesDocument } from "../../gen/types";
import { ActionContext } from "document-model/document";
import { ADDRESS_ALLOW_LIST } from "../constants";

describe("Issues Operations", () => {
  let document: AtlasFeedbackIssuesDocument;

  beforeEach(() => {
    document = utils.createDocument();
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
    expect(operation.error).toBe("User is not signed in");
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
    expect(operation.error).toBe("User is not allowed to submit issues");
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
    expect(operation.error).toBe("User is not signed in");
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
    expect(operation.error).toBe("User is not allowed to delete issues");
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
});
