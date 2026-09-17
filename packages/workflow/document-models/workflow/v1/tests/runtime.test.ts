import { generateMock } from "document-model/mock";
import {
  isWorkflowDocument,
  reducer,
  setLastRun,
  SetLastRunInputSchema,
  utils,
} from "document-models/workflow/v1";
import { describe, expect, it } from "vitest";

describe("RuntimeOperations", () => {
  it("should handle setLastRun operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetLastRunInputSchema(), {
      lastRunAt: "2024-01-01T00:00:00.000Z",
    });

    const updatedDocument = reducer(document, setLastRun(input));

    expect(isWorkflowDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_LAST_RUN",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
