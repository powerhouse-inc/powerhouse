/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateMock } from "@powerhousedao/codegen";
import utils from "../../gen/utils.js";
import {
  z,
  type SetEditorNameInput,
  type SetEditorIdInput,
  type AddDocumentTypeInput,
  type RemoveDocumentTypeInput,
} from "../../gen/schema/index.js";
import { reducer } from "../../gen/reducer.js";
import * as creators from "../../gen/base-operations/creators.js";
import type { DocumentEditorDocument } from "../../gen/types.js";

describe("BaseOperations Operations", () => {
  let document: DocumentEditorDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  it("should handle setEditorName operation", () => {
    const input: SetEditorNameInput = generateMock(
      z.SetEditorNameInputSchema(),
    );

    const updatedDocument = reducer(document, creators.setEditorName(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("SET_EDITOR_NAME");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle setEditorId operation", () => {
    const input: SetEditorIdInput = generateMock(z.SetEditorIdInputSchema());

    const updatedDocument = reducer(document, creators.setEditorId(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("SET_EDITOR_ID");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle addDocumentType operation", () => {
    const input: AddDocumentTypeInput = generateMock(
      z.AddDocumentTypeInputSchema(),
    );

    const updatedDocument = reducer(document, creators.addDocumentType(input));

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe("ADD_DOCUMENT_TYPE");
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
  it("should handle removeDocumentType operation", () => {
    const input: RemoveDocumentTypeInput = generateMock(
      z.RemoveDocumentTypeInputSchema(),
    );

    const updatedDocument = reducer(
      document,
      creators.removeDocumentType(input),
    );

    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].type).toBe(
      "REMOVE_DOCUMENT_TYPE",
    );
    expect(updatedDocument.operations.global[0].input).toStrictEqual(input);
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
