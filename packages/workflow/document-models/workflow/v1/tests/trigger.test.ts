import { generateMock } from "document-model/mock";
import {
  clearTrigger,
  ClearTriggerInputSchema,
  isWorkflowDocument,
  reducer,
  setTrigger,
  SetTriggerInputSchema,
  utils,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

describe("TriggerOperations", () => {
  it("should handle setTrigger operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetTriggerInputSchema());

    const updatedDocument = reducer(document, setTrigger(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_TRIGGER",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle clearTrigger operation", () => {
    const document = utils.createDocument();
    const input = generateMock(ClearTriggerInputSchema());

    const updatedDocument = reducer(document, clearTrigger(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "CLEAR_TRIGGER",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
