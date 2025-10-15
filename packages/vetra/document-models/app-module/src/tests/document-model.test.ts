/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import { describe, expect, it } from "vitest";
import * as baseCreators from "../../gen/base-operations/creators.js";
import * as dndCreators from "../../gen/dnd-operations/creators.js";
import { reducer } from "../../gen/reducer.js";
import utils from "../../gen/utils.js";

describe("App Module Document Model", () => {
  it("should have correct initial values", () => {
    const document = utils.createDocument();

    expect(document.state.global.name).toBe("");
    expect(document.state.global.status).toBe("DRAFT");
    expect(document.state.global.documentTypes).toEqual([
      { id: "all-documents", documentType: "*" },
    ]);
    expect(document.state.global.dragAndDrop).toEqual({ enabled: true });
  });

  it("should handle multiple operations and maintain consistency", () => {
    const document = utils.createDocument();

    let updatedDoc = reducer(
      document,
      baseCreators.setAppName({ name: "Test App" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      baseCreators.setAppStatus({ status: "CONFIRMED" }),
    );
    updatedDoc = reducer(
      updatedDoc,
      baseCreators.addDocumentType({
        id: "test-type",
        documentType: "powerhouse/test",
      }),
    );

    // Verify state consistency
    expect(updatedDoc.state.global.name).toBe("Test App");
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");
    expect(updatedDoc.state.global.documentTypes).toHaveLength(2);
  });

  describe("Complex Scenarios", () => {
    it("should handle locked configuration: disable DnD and remove all types", () => {
      const document = utils.createDocument();

      // Disable drag and drop
      let updatedDoc = reducer(
        document,
        dndCreators.setDragAndDropEnabled({ enabled: false }),
      );
      expect(updatedDoc.state.global.dragAndDrop?.enabled).toBe(false);

      // Remove all document types
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.removeDocumentType({ id: "all-documents" }),
      );
      expect(updatedDoc.state.global.documentTypes).toEqual([]);

      // Set as confirmed to "lock" it
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.setAppStatus({ status: "CONFIRMED" }),
      );

      // Verify locked configuration
      expect(updatedDoc.state.global.dragAndDrop?.enabled).toBe(false);
      expect(updatedDoc.state.global.documentTypes).toHaveLength(0);
      expect(updatedDoc.state.global.status).toBe("CONFIRMED");
    });

    it("should handle reset scenario: remove all types and add new ones", () => {
      const document = utils.createDocument();

      // Remove existing types
      let updatedDoc = reducer(
        document,
        baseCreators.removeDocumentType({ id: "all-documents" }),
      );
      expect(updatedDoc.state.global.documentTypes).toEqual([]);

      // Add new types from scratch
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({
          id: "new-type-1",
          documentType: "powerhouse/new1",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({
          id: "new-type-2",
          documentType: "powerhouse/new2",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({
          id: "new-type-3",
          documentType: "powerhouse/new3",
        }),
      );

      // Verify reset completed
      expect(updatedDoc.state.global.documentTypes).toHaveLength(3);
      expect(
        updatedDoc.state.global.documentTypes?.find(
          (dt) => dt.id === "all-documents",
        ),
      ).toBeUndefined();
      expect(
        updatedDoc.state.global.documentTypes?.find(
          (dt) => dt.id === "new-type-1",
        ),
      ).toBeDefined();
    });

    it("should maintain state integrity with complex add/remove sequences", () => {
      const document = utils.createDocument();

      // Add multiple types
      let updatedDoc = reducer(
        document,
        baseCreators.addDocumentType({ id: "type-a", documentType: "a" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({ id: "type-b", documentType: "b" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({ id: "type-c", documentType: "c" }),
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(4);

      // Remove middle one
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.removeDocumentType({ id: "type-b" }),
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(3);

      // Add it back
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({ id: "type-b", documentType: "b-new" }),
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(4);

      // Verify order and content
      const typeB = updatedDoc.state.global.documentTypes?.find(
        (dt) => dt.id === "type-b",
      );
      expect(typeB?.documentType).toBe("b-new");
    });
  });
});
