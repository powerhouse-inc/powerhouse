import { generateMock } from "document-model/mock";
import {
  isWorkflowDocument,
  reducer,
  setWorkflowDescription,
  SetWorkflowDescriptionInputSchema,
  setWorkflowName,
  SetWorkflowNameInputSchema,
  setWorkflowStatus,
  SetWorkflowStatusInputSchema,
  utils,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

describe("WorkflowOperations", () => {
  it("should handle setWorkflowName operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetWorkflowNameInputSchema());

    const updatedDocument = reducer(document, setWorkflowName(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_WORKFLOW_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setWorkflowDescription operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetWorkflowDescriptionInputSchema());

    const updatedDocument = reducer(document, setWorkflowDescription(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_WORKFLOW_DESCRIPTION",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setWorkflowStatus operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetWorkflowStatusInputSchema());

    const updatedDocument = reducer(document, setWorkflowStatus(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_WORKFLOW_STATUS",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
