import { generateMock } from "document-model/mock";
import {
  isWorkflowDocument,
  reducer,
  removeVariable,
  RemoveVariableInputSchema,
  setVariable,
  SetVariableInputSchema,
  utils,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

describe("VariablesOperations", () => {
  it("should handle setVariable operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetVariableInputSchema());

    const updatedDocument = reducer(document, setVariable(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_VARIABLE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle removeVariable operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveVariableInputSchema());

    const updatedDocument = reducer(document, removeVariable(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_VARIABLE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
