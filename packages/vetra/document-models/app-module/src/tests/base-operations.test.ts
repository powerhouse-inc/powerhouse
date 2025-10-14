/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { generateMock } from "@powerhousedao/codegen";
import { beforeEach, describe, expect, it } from "vitest";
import * as creators from "../../gen/base-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import type {
  AddDocumentTypeInput,
  RemoveDocumentTypeInput,
  SetAppNameInput,
  SetAppStatusInput,
} from "../../gen/schema/index.js";
import { z } from "../../gen/schema/index.js";
import type { AppModuleDocument } from "../../gen/types.js";
import utils from "../../gen/utils.js";

describe("BaseOperations Operations", () => {
  let document: AppModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  describe("setAppName", () => {
    it("should handle setAppName operation", () => {
      const input: SetAppNameInput = generateMock(z.SetAppNameInputSchema());

      const updatedDocument = reducer(document, creators.setAppName(input));

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].action.type).toBe(
        "SET_APP_NAME",
      );
      expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
        input,
      );
      expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it("should mutate state with new name", () => {
      const input: SetAppNameInput = { name: "My Test App" };

      const updatedDocument = reducer(document, creators.setAppName(input));

      expect(updatedDocument.state.global.name).toBe("My Test App");
    });

    it("should reject empty string and store error in operation", () => {
      const input: SetAppNameInput = { name: "" };

      const updatedDocument = reducer(document, creators.setAppName(input));

      // The operation should be recorded but with an error
      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].error).toBe(
        "App name cannot be empty",
      );
      // State should remain unchanged
      expect(updatedDocument.state.global.name).toBe("");
    });

    it("should reject whitespace-only name and store error in operation", () => {
      const input: SetAppNameInput = { name: "   " };

      const updatedDocument = reducer(document, creators.setAppName(input));

      // The operation should be recorded but with an error
      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].error).toBe(
        "App name cannot be empty",
      );
      // State should remain unchanged
      expect(updatedDocument.state.global.name).toBe("");
    });
  });

  describe("setAppStatus", () => {
    it("should handle setAppStatus operation", () => {
      const input: SetAppStatusInput = generateMock(
        z.SetAppStatusInputSchema(),
      );

      const updatedDocument = reducer(document, creators.setAppStatus(input));

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].action.type).toBe(
        "SET_APP_STATUS",
      );
      expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
        input,
      );
      expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it("should mutate state with new status", () => {
      const input: SetAppStatusInput = { status: "CONFIRMED" };

      const updatedDocument = reducer(document, creators.setAppStatus(input));

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from DRAFT to CONFIRMED", () => {
      expect(document.state.global.status).toBe("DRAFT");

      const updatedDocument = reducer(
        document,
        creators.setAppStatus({ status: "CONFIRMED" }),
      );

      expect(updatedDocument.state.global.status).toBe("CONFIRMED");
    });

    it("should transition from CONFIRMED to DRAFT", () => {
      const confirmedDoc = reducer(
        document,
        creators.setAppStatus({ status: "CONFIRMED" }),
      );

      const updatedDocument = reducer(
        confirmedDoc,
        creators.setAppStatus({ status: "DRAFT" }),
      );

      expect(updatedDocument.state.global.status).toBe("DRAFT");
    });

    it("should handle setting same status twice", () => {
      const firstUpdate = reducer(
        document,
        creators.setAppStatus({ status: "CONFIRMED" }),
      );
      const secondUpdate = reducer(
        firstUpdate,
        creators.setAppStatus({ status: "CONFIRMED" }),
      );

      expect(secondUpdate.state.global.status).toBe("CONFIRMED");
      expect(secondUpdate.operations.global).toHaveLength(2);
    });
  });

  describe("addDocumentType", () => {
    it("should handle addDocumentType operation", () => {
      const input: AddDocumentTypeInput = generateMock(
        z.AddDocumentTypeInputSchema(),
      );

      const updatedDocument = reducer(
        document,
        creators.addDocumentType(input),
      );

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].action.type).toBe(
        "ADD_DOCUMENT_TYPE",
      );
      expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
        input,
      );
      expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

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

    it("should initialize array when documentTypes is null", () => {
      document.state.global.documentTypes = null;

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

      expect(updatedDoc.state.global.documentTypes).toHaveLength(4); // 1 initial + 3 added
      expect(updatedDoc.state.global.documentTypes?.[1]).toEqual({
        id: "type-1",
        documentType: "powerhouse/a",
      });
      expect(updatedDoc.state.global.documentTypes?.[2]).toEqual({
        id: "type-2",
        documentType: "powerhouse/b",
      });
      expect(updatedDoc.state.global.documentTypes?.[3]).toEqual({
        id: "type-3",
        documentType: "powerhouse/c",
      });
    });

    it("should reject duplicate IDs and store error in operation", () => {
      const input: AddDocumentTypeInput = {
        id: "duplicate",
        documentType: "powerhouse/first",
      };

      // First addition should succeed
      let updatedDoc = reducer(document, creators.addDocumentType(input));
      expect(updatedDoc.state.global.documentTypes).toHaveLength(2); // initial + 1
      expect(updatedDoc.operations.global[0].error).toBeUndefined();

      // Second addition with same ID should fail
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          id: "duplicate",
          documentType: "powerhouse/second",
        }),
      );

      // The operation should be recorded with an error
      expect(updatedDoc.operations.global).toHaveLength(2);
      expect(updatedDoc.operations.global[1].error).toBe(
        'Document type with id "duplicate" already exists',
      );

      // State should remain unchanged (still only 2 items)
      expect(updatedDoc.state.global.documentTypes).toHaveLength(2);
      const duplicates = updatedDoc.state.global.documentTypes?.filter(
        (dt) => dt.id === "duplicate",
      );
      expect(duplicates).toHaveLength(1);
    });

    it("should preserve initial all-documents item", () => {
      const input: AddDocumentTypeInput = {
        id: "new-type",
        documentType: "powerhouse/new",
      };

      const updatedDocument = reducer(
        document,
        creators.addDocumentType(input),
      );

      expect(updatedDocument.state.global.documentTypes?.[0]).toEqual({
        id: "all-documents",
        documentType: "*",
      });
    });

    it("should increase array length correctly", () => {
      const initialLength = document.state.global.documentTypes?.length ?? 0;

      const updatedDocument = reducer(
        document,
        creators.addDocumentType({ id: "new", documentType: "powerhouse/new" }),
      );

      expect(updatedDocument.state.global.documentTypes?.length).toBe(
        initialLength + 1,
      );
    });

    it("should handle special documentType values", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({ id: "wildcard", documentType: "*" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({ id: "empty", documentType: "" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          id: "specific",
          documentType: "powerhouse/budget",
        }),
      );

      expect(updatedDoc.state.global.documentTypes).toContainEqual({
        id: "wildcard",
        documentType: "*",
      });
      expect(updatedDoc.state.global.documentTypes).toContainEqual({
        id: "empty",
        documentType: "",
      });
      expect(updatedDoc.state.global.documentTypes).toContainEqual({
        id: "specific",
        documentType: "powerhouse/budget",
      });
    });
  });

  describe("removeDocumentType", () => {
    it("should handle removeDocumentType operation", () => {
      const input: RemoveDocumentTypeInput = generateMock(
        z.RemoveDocumentTypeInputSchema(),
      );

      const updatedDocument = reducer(
        document,
        creators.removeDocumentType(input),
      );

      expect(updatedDocument.operations.global).toHaveLength(1);
      expect(updatedDocument.operations.global[0].action.type).toBe(
        "REMOVE_DOCUMENT_TYPE",
      );
      expect(updatedDocument.operations.global[0].action.input).toStrictEqual(
        input,
      );
      expect(updatedDocument.operations.global[0].index).toEqual(0);
    });

    it("should mutate state by removing document type from array", () => {
      const updatedDocument = reducer(
        document,
        creators.removeDocumentType({ id: "all-documents" }),
      );

      expect(updatedDocument.state.global.documentTypes).not.toContainEqual({
        id: "all-documents",
        documentType: "*",
      });
    });

    it("should remove existing ID from initial state", () => {
      const initialLength = document.state.global.documentTypes?.length ?? 0;

      const updatedDocument = reducer(
        document,
        creators.removeDocumentType({ id: "all-documents" }),
      );

      expect(updatedDocument.state.global.documentTypes?.length).toBe(
        initialLength - 1,
      );
      expect(
        updatedDocument.state.global.documentTypes?.find(
          (dt) => dt.id === "all-documents",
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

    it("should handle null array gracefully", () => {
      document.state.global.documentTypes = null;

      const updatedDocument = reducer(
        document,
        creators.removeDocumentType({ id: "any-id" }),
      );

      expect(updatedDocument.state.global.documentTypes).toEqual([]);
    });

    it("should remove all items until array is empty", () => {
      const updatedDocument = reducer(
        document,
        creators.removeDocumentType({ id: "all-documents" }),
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
        updatedDoc.state.global.documentTypes?.find(
          (dt) => dt.id === "temp-type",
        ),
      ).toBeUndefined();
      expect(updatedDoc.operations.global).toHaveLength(2);
    });

    it("should remove from middle and preserve order", () => {
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

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ id: "type-2" }),
      );

      expect(updatedDoc.state.global.documentTypes).toHaveLength(3);
      expect(updatedDoc.state.global.documentTypes?.[0].id).toBe(
        "all-documents",
      );
      expect(updatedDoc.state.global.documentTypes?.[1].id).toBe("type-1");
      expect(updatedDoc.state.global.documentTypes?.[2].id).toBe("type-3");
    });

    it("should decrease array length correctly", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          id: "to-remove",
          documentType: "powerhouse/test",
        }),
      );

      const lengthBefore = updatedDoc.state.global.documentTypes?.length ?? 0;

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ id: "to-remove" }),
      );

      expect(updatedDoc.state.global.documentTypes?.length).toBe(
        lengthBefore - 1,
      );
    });
  });
});
