/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { utils as documentModelUtils } from "document-model/document";

import utils from "../../gen/utils";
import { z, CreateIssueInput, DeleteIssueInput } from "../../gen/schema";
import { reducer } from "../../gen/reducer";
import * as creators from "../../gen/issues/creators";
import { AtlasFeedbackIssuesDocument } from "../../gen/types";

describe("Issues Operations", () => {
  let document: AtlasFeedbackIssuesDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle createIssue operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: CreateIssueInput = generateMock(z.CreateIssueInputSchema());

    const updatedDocument = reducer(document, creators.createIssue(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("CREATE_ISSUE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle deleteIssue operation", () => {
    // generate a random id
    // const id = documentModelUtils.hashKey();

    const input: DeleteIssueInput = generateMock(z.DeleteIssueInputSchema());

    const updatedDocument = reducer(document, creators.deleteIssue(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("DELETE_ISSUE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
