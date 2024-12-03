/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { utils as documentModelUtils } from "document-model/document";

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
});
