import { generateMock } from "document-model/mock";
import {
  isConnectionDocument,
  reducer,
  removeSecretRef,
  RemoveSecretRefInputSchema,
  setConfig,
  SetConfigInputSchema,
  setSecretRef,
  SetSecretRefInputSchema,
  utils,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";

describe("ConfigOperations", () => {
  it("should handle setConfig operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetConfigInputSchema());

    const updatedDocument = reducer(document, setConfig(input));

    expect(isConnectionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe("SET_CONFIG");
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setSecretRef operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetSecretRefInputSchema());

    const updatedDocument = reducer(document, setSecretRef(input));

    expect(isConnectionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_SECRET_REF",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle removeSecretRef operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveSecretRefInputSchema());

    const updatedDocument = reducer(document, removeSecretRef(input));

    expect(isConnectionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_SECRET_REF",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
