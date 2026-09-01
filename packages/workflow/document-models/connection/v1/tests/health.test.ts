import { generateMock } from "document-model/mock";
import {
  isConnectionDocument,
  recordCheckResult,
  RecordCheckResultInputSchema,
  reducer,
  utils,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";

describe("HealthOperations", () => {
  it("should handle recordCheckResult operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RecordCheckResultInputSchema());

    const updatedDocument = reducer(document, recordCheckResult(input));

    expect(isConnectionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "RECORD_CHECK_RESULT",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
