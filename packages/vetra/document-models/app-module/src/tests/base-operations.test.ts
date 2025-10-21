/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { beforeEach, describe, expect, it } from "vitest";
import * as creators from "../../gen/base-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import type {
  AddDocumentTypeInput,
  SetAppNameInput,
  SetAppStatusInput,
} from "../../gen/schema/index.js";
import type { AppModuleDocument } from "../../gen/types.js";
import utils from "../../gen/utils.js";

describe("BaseOperations Operations", () => {
  let document: AppModuleDocument;

  beforeEach(() => {
    document = utils.createDocument();
  });

  describe("setAppName", () => {
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
    it("should mutate state by adding document type to array", () => {
      const input: AddDocumentTypeInput = {
        documentType: "powerhouse/test",
      };

      const updatedDocument = reducer(
        document,
        creators.addDocumentType(input),
      );

      expect(updatedDocument.state.global.allowedDocumentTypes).toContain(
        "powerhouse/test",
      );
    });

    it("should initialize array when allowedDocumentTypes is null", () => {
      // Initial state has allowedDocumentTypes as null
      expect(document.state.global.allowedDocumentTypes).toBeNull();

      const input: AddDocumentTypeInput = {
        documentType: "powerhouse/first",
      };

      const updatedDocument = reducer(
        document,
        creators.addDocumentType(input),
      );

      expect(updatedDocument.state.global.allowedDocumentTypes).toEqual([
        "powerhouse/first",
      ]);
    });

    it("should add multiple document types sequentially", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          documentType: "powerhouse/a",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          documentType: "powerhouse/b",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          documentType: "powerhouse/c",
        }),
      );

      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(3);
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/a",
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/b",
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/c",
      );
    });

    it("should reject duplicate document types", () => {
      const input: AddDocumentTypeInput = {
        documentType: "powerhouse/duplicate",
      };

      // First addition should succeed
      let updatedDoc = reducer(document, creators.addDocumentType(input));
      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(1);

      // Second addition with same documentType should not add duplicate (uses Set)
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          documentType: "powerhouse/duplicate",
        }),
      );

      // Should still only have 1 item (no duplicates in a Set)
      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(1);
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/duplicate",
      );
    });

    it("should handle adding various documentType values", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({ documentType: "powerhouse/budget" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({ documentType: "powerhouse/document-model" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({ documentType: "custom/type" }),
      );

      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/budget",
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/document-model",
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "custom/type",
      );
    });
  });

  describe("removeDocumentType", () => {
    it("should mutate state by removing document type from array", () => {
      // First add a document type
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          documentType: "powerhouse/to-remove",
        }),
      );

      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/to-remove",
      );

      // Then remove it
      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ documentType: "powerhouse/to-remove" }),
      );

      expect(updatedDoc.state.global.allowedDocumentTypes).not.toContain(
        "powerhouse/to-remove",
      );
    });

    it("should remove existing document type", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          documentType: "powerhouse/existing",
        }),
      );

      const lengthBefore =
        updatedDoc.state.global.allowedDocumentTypes?.length ?? 0;

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ documentType: "powerhouse/existing" }),
      );

      expect(updatedDoc.state.global.allowedDocumentTypes?.length).toBe(
        lengthBefore - 1,
      );
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes(
          "powerhouse/existing",
        ),
      ).toBe(false);
    });

    it("should gracefully handle non-existent document type", () => {
      const updatedDocument = reducer(
        document,
        creators.removeDocumentType({ documentType: "non-existent-type" }),
      );

      // Should result in empty array
      expect(updatedDocument.state.global.allowedDocumentTypes).toEqual([]);
    });

    it("should handle null array gracefully", () => {
      expect(document.state.global.allowedDocumentTypes).toBeNull();

      const updatedDocument = reducer(
        document,
        creators.removeDocumentType({ documentType: "any-type" }),
      );

      expect(updatedDocument.state.global.allowedDocumentTypes).toEqual([]);
    });

    it("should add then immediately remove item", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          documentType: "powerhouse/temp",
        }),
      );

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ documentType: "powerhouse/temp" }),
      );

      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes(
          "powerhouse/temp",
        ),
      ).toBe(false);
      expect(updatedDoc.operations.global).toHaveLength(2);
    });

    it("should remove from list and preserve other items", () => {
      let updatedDoc = reducer(
        document,
        creators.addDocumentType({
          documentType: "powerhouse/a",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          documentType: "powerhouse/b",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        creators.addDocumentType({
          documentType: "powerhouse/c",
        }),
      );

      updatedDoc = reducer(
        updatedDoc,
        creators.removeDocumentType({ documentType: "powerhouse/b" }),
      );

      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(2);
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/a",
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toContain(
        "powerhouse/c",
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).not.toContain(
        "powerhouse/b",
      );
    });
  });
});
