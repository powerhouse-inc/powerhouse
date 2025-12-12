/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import type {
  AddDocumentTypeInput,
  DocumentEditorDocument,
  SetEditorNameInput,
  SetEditorStatusInput,
} from "@powerhousedao/vetra/document-models/document-editor";
import {
  addDocumentType,
  reducer,
  removeDocumentType,
  setEditorName,
  setEditorStatus,
  utils,
  isDocumentEditorDocument,
  SetEditorNameInputSchema,
  AddDocumentTypeInputSchema,
  RemoveDocumentTypeInputSchema,
  SetEditorStatusInputSchema,
} from "@powerhousedao/vetra/document-models/document-editor";
import { beforeEach, describe, expect, it } from "vitest";
import { generateMock } from "@powerhousedao/codegen";

describe("BaseOperations Operations", () => {
  let document: DocumentEditorDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  describe("setEditorName", () => {
    it("should mutate state with new name", () => {
      const input: SetEditorNameInput = { name: "My Editor" };

      const updatedDocument = reducer(document, setEditorName(input));

      expect(updatedDocument.state.global.name).toBe("My Editor");
    });

    it("should reject empty string and store error in operation", () => {
      const input: SetEditorNameInput = { name: "" };

      const updatedDocument = reducer(document, setEditorName(input));

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].error).toBe(
        "Editor name cannot be empty",
      );
      expect(updatedDocument.state.global.name).toBe("");
    });
  });

  describe("setEditorStatus", () => {
    it("should mutate state with new status", () => {
      const input: SetEditorStatusInput = { status: "CONFIRMED" };

      const updatedDocument = reducer(document, setEditorStatus(input));

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from DRAFT to CONFIRMED", () => {
      expect(document.state.global.status).toBe("DRAFT");

      const updatedDocument = reducer(
        document,
        setEditorStatus({ status: "CONFIRMED" }),
      );

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from CONFIRMED to DRAFT", () => {
      const confirmedDoc = reducer(
        document,
        setEditorStatus({ status: "CONFIRMED" }),
      );

      const updatedDocument = reducer(
        confirmedDoc,
        setEditorStatus({ status: "DRAFT" }),
      );

      expect(updatedDocument.state.global.status).toBe("DRAFT");
    });
  });

  describe("addDocumentType", () => {
    it("should mutate state by adding document type to array", () => {
      const input: AddDocumentTypeInput = {
        id: "test-type-1",
        documentType: "powerhouse/test",
      };

      const updatedDocument = reducer(document, addDocumentType(input));

      expect(updatedDocument.state.global.documentTypes).toContainEqual({
        id: "test-type-1",
        documentType: "powerhouse/test",
      });
    });

    it("should add to empty array from initial state", () => {
      expect(document.state.global.documentTypes).toEqual([]);

      const input: AddDocumentTypeInput = {
        id: "first-type",
        documentType: "powerhouse/first",
      };

      const updatedDocument = reducer(document, addDocumentType(input));

      expect(updatedDocument.state.global.documentTypes).toEqual([
        { id: "first-type", documentType: "powerhouse/first" },
      ]);
    });

    it("should add multiple document types sequentially", () => {
      let updatedDoc = reducer(
        document,
        addDocumentType({
          id: "type-1",
          documentType: "powerhouse/a",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "type-2",
          documentType: "powerhouse/b",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "type-3",
          documentType: "powerhouse/c",
        }),
      );

      expect(updatedDoc.state.global.documentTypes).toHaveLength(3);
      expect(updatedDoc.state.global.documentTypes[0]).toEqual({
        id: "type-1",
        documentType: "powerhouse/a",
      });
      expect(updatedDoc.state.global.documentTypes[1]).toEqual({
        id: "type-2",
        documentType: "powerhouse/b",
      });
      expect(updatedDoc.state.global.documentTypes[2]).toEqual({
        id: "type-3",
        documentType: "powerhouse/c",
      });
    });

    it("should reject duplicate IDs and store error in operation", () => {
      const input: AddDocumentTypeInput = {
        id: "duplicate",
        documentType: "powerhouse/first",
      };

      let updatedDoc = reducer(document, addDocumentType(input));
      expect(updatedDoc.state.global.documentTypes).toHaveLength(1);
      expect(updatedDoc.operations.global[0].error).toBeUndefined();

      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "duplicate",
          documentType: "powerhouse/second",
        }),
      );

      expect(updatedDoc.operations.global).toHaveLength(2);
      expect(updatedDoc.operations.global[1].error).toBe(
        'Document type with id "duplicate" already exists',
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(1);
    });
  });

  describe("removeDocumentType", () => {
    it("should mutate state by removing document type from array", () => {
      let updatedDoc = reducer(
        document,
        addDocumentType({
          id: "to-remove",
          documentType: "powerhouse/test",
        }),
      );

      updatedDoc = reducer(updatedDoc, removeDocumentType({ id: "to-remove" }));

      expect(updatedDoc.state.global.documentTypes).not.toContainEqual({
        id: "to-remove",
        documentType: "powerhouse/test",
      });
    });

    it("should remove existing ID", () => {
      let updatedDoc = reducer(
        document,
        addDocumentType({
          id: "existing",
          documentType: "powerhouse/test",
        }),
      );

      const lengthBefore = updatedDoc.state.global.documentTypes.length;

      updatedDoc = reducer(updatedDoc, removeDocumentType({ id: "existing" }));

      expect(updatedDoc.state.global.documentTypes.length).toBe(
        lengthBefore - 1,
      );
      expect(
        updatedDoc.state.global.documentTypes.find(
          (dt) => dt.id === "existing",
        ),
      ).toBeUndefined();
    });

    it("should gracefully handle non-existent ID", () => {
      const initialState = document.state.global.documentTypes;

      const updatedDocument = reducer(
        document,
        removeDocumentType({ id: "non-existent-id" }),
      );

      expect(updatedDocument.state.global.documentTypes).toEqual(initialState);
    });

    it("should handle empty array gracefully", () => {
      expect(document.state.global.documentTypes).toEqual([]);

      const updatedDocument = reducer(
        document,
        removeDocumentType({ id: "any-id" }),
      );

      expect(updatedDocument.state.global.documentTypes).toEqual([]);
    });

    it("should add then immediately remove item", () => {
      let updatedDoc = reducer(
        document,
        addDocumentType({
          id: "temp-type",
          documentType: "powerhouse/temp",
        }),
      );

      updatedDoc = reducer(updatedDoc, removeDocumentType({ id: "temp-type" }));

      expect(
        updatedDoc.state.global.documentTypes.find(
          (dt) => dt.id === "temp-type",
        ),
      ).toBeUndefined();
      expect(updatedDoc.operations.global).toHaveLength(2);
    });
  });

  it("should handle setEditorName operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetEditorNameInputSchema());

    const updatedDocument = reducer(document, setEditorName(input));

    expect(isDocumentEditorDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_EDITOR_NAME",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle addDocumentType operation", () => {
    const document = utils.createDocument();
    const input = generateMock(AddDocumentTypeInputSchema());

    const updatedDocument = reducer(document, addDocumentType(input));

    expect(isDocumentEditorDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "ADD_DOCUMENT_TYPE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle removeDocumentType operation", () => {
    const document = utils.createDocument();
    const input = generateMock(RemoveDocumentTypeInputSchema());

    const updatedDocument = reducer(document, removeDocumentType(input));

    expect(isDocumentEditorDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "REMOVE_DOCUMENT_TYPE",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });

  it("should handle setEditorStatus operation", () => {
    const document = utils.createDocument();
    const input = generateMock(SetEditorStatusInputSchema());

    const updatedDocument = reducer(document, setEditorStatus(input));

    expect(isDocumentEditorDocument(updatedDocument)).toBe(true);
    expect(updatedDocument.operations.global).toHaveLength(1);
    expect(updatedDocument.operations.global[0].action.type).toBe(
      "SET_EDITOR_STATUS",
    );
    expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
      input,
    );
    expect(updatedDocument.operations.global[0].index).toEqual(0);
  });
});
