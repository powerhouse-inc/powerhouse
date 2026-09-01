import { generateMock } from "document-model/mock";
import {
  isConnectionDocument,
  reducer,
  setAccountLabel,
  SetAccountLabelInputSchema,
  setConnectionName,
  SetConnectionNameInputSchema,
  setConnector,
  SetConnectorInputSchema,
  utils,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";

describe("ConnectionOperations", () => {
  it("should handle setConnectionName operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetConnectionNameInputSchema());

    const updatedDocument = reducer(document, setConnectionName(input));

    expect(isConnectionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_CONNECTION_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setConnector operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetConnectorInputSchema());

    const updatedDocument = reducer(document, setConnector(input));

    expect(isConnectionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_CONNECTOR",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setAccountLabel operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetAccountLabelInputSchema());

    const updatedDocument = reducer(document, setAccountLabel(input));

    expect(isConnectionDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_ACCOUNT_LABEL",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
