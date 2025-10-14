/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { beforeEach, describe, expect, it } from "vitest";
import * as creators from "../../gen/base-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import type {
  AddDocumentTypeInput,
  SetProcessorNameInput,
  SetProcessorTypeInput,
} from "../../gen/schema/index.js";
import type { ProcessorModuleDocument } from "../../gen/types.js";
import utils from "../../gen/utils.js";

describe("BaseOperations Operations", () => {
  let document: ProcessorModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  describe("setProcessorName", () => {
    it("should mutate state with new name", () => {
      const input: SetProcessorNameInput = { name: "My Processor" };

      const updatedDocument = reducer(
        document,
        creators.setProcessorName(input),
      );

      expect(updatedDocument.state.global.name).toBe("My Processor");
    });

    it("should reject empty string and store error in operation", () => {
      const input: SetProcessorNameInput = { name: "" };

      const updatedDocument = reducer(
        document,
        creators.setProcessorName(input),
      );

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].error).toBe(
        "Processor name cannot be empty",
      );
      expect(updatedDocument.state.global.name).toBe("");
    });
  });

  describe("setProcessorType", () => {
    it("should mutate state with new type", () => {
      const input: SetProcessorTypeInput = { type: "analytics" };

      const updatedDocument = reducer(
        document,
        creators.setProcessorType(input),
      );

      expect(updatedDocument.state.global.type).toBe("analytics");
    });

    it("should reject empty string and store error in operation", () => {
      const input: SetProcessorTypeInput = { type: "" };

      const updatedDocument = reducer(
        document,
        creators.setProcessorType(input),
      );

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].error).toBe(
        "Processor type cannot be empty",
      );
      expect(updatedDocument.state.global.type).toBe("");
    });
  });

  describe("setProcessorStatus", () => {
    it("should mutate state with new status", () => {
      const input = { status: "CONFIRMED" as const };

      const updatedDocument = reducer(
        document,
        creators.setProcessorStatus(input),
      );

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from DRAFT to CONFIRMED", () => {
      expect(document.state.global.status).toBe("DRAFT");

      const updatedDocument = reducer(
        document,
        creators.setProcessorStatus({ status: "CONFIRMED" }),
      );

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from CONFIRMED to DRAFT", () => {
      const confirmedDoc = reducer(
        document,
        creators.setProcessorStatus({ status: "CONFIRMED" }),
      );

      const updatedDocument = reducer(
        confirmedDoc,
        creators.setProcessorStatus({ status: "DRAFT" }),
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

      const updatedDocument = reducer(
        document,
        creators.addDocumentType(input),
      );

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

      const updatedDocument = reducer(
        document,
        creators.addDocumentType(input),
      );

      expect(updatedDocument.state.global.documentTypes).toEqual([
        { id: "first-type", documentType: "powerhouse/first" },
      ]);
    });

    it("should add multiple document types sequentially", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          id: "type-1",
          documentType: "powerhouse/a",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          id: "type-2",
          documentType: "powerhouse/b",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
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

      let updatedDoc = reducer(document, creators.addDocumentType(input));
      expect(updatedDoc.state.global.documentTypes).toHaveLength(1);
      expect(updatedDoc.operations.global[0].error).toBeUndefined();

      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
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
        creators.addDocumentType({
          id: "to-remove",
          documentType: "powerhouse/test",
        }),
      );

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ id: "to-remove" }),
      );

      expect(updatedDoc.state.global.documentTypes).not.toContainEqual({
        id: "to-remove",
        documentType: "powerhouse/test",
      });
    });

    it("should remove existing ID", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          id: "existing",
          documentType: "powerhouse/test",
        }),
      );

      const lengthBefore = updatedDoc.state.global.documentTypes.length;

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ id: "existing" }),
      );

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
        creators.removeDocumentType({ id: "non-existent-id" }),
      );

      expect(updatedDocument.state.global.documentTypes).toEqual(initialState);
    });

    it("should handle empty array gracefully", () => {
      expect(document.state.global.documentTypes).toEqual([]);

      const updatedDocument = reducer(
        document,
        creators.removeDocumentType({ id: "any-id" }),
      );

      expect(updatedDocument.state.global.documentTypes).toEqual([]);
    });

    it("should add then immediately remove item", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          id: "temp-type",
          documentType: "powerhouse/temp",
        }),
      );

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ id: "temp-type" }),
      );

      expect(
        updatedDoc.state.global.documentTypes.find(
          (dt) => dt.id === "temp-type",
        ),
      ).toBeUndefined();
      expect(updatedDoc.operations.global).toHaveLength(2);
    });
  });
});
