import { generateMock } from "document-model/mock";
import {
  isWorkflowDocument,
  reducer,
  setPolicy,
  SetPolicyInputSchema,
  utils,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

describe("PolicyOperations", () => {
  it("should handle setPolicy operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetPolicyInputSchema());

    const updatedDocument = reducer(document, setPolicy(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("SET_POLICY");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
