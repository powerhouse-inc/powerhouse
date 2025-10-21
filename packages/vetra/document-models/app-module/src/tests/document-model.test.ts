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
    expect(document.state.global.allowedDocumentTypes).toBeNull();
    expect(document.state.global.isDragAndDropEnabled).toBe(true);
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
        documentType: "powerhouse/test",
      }),
    );

    // Verify state consistency
    expect(updatedDoc.state.global.name).toBe("Test App");
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");
    expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(1);
  });

  describe("Complex Scenarios", () => {
    it("should handle locked configuration: disable DnD and clear document types", () => {
      const document = utils.createDocument();

      // Add some document types first
      let updatedDoc = reducer(
        document,
        baseCreators.addDocumentType({ documentType: "powerhouse/type1" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({ documentType: "powerhouse/type2" }),
      );

      // Disable drag and drop
      updatedDoc = reducer(
        updatedDoc,
        dndCreators.setDragAndDropEnabled({ enabled: false }),
      );
      expect(updatedDoc.state.global.isDragAndDropEnabled).toBe(false);

      // Remove all document types
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.removeDocumentType({ documentType: "powerhouse/type1" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.removeDocumentType({ documentType: "powerhouse/type2" }),
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toEqual([]);

      // Set as confirmed to "lock" it
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.setAppStatus({ status: "CONFIRMED" }),
      );

      // Verify locked configuration
      expect(updatedDoc.state.global.isDragAndDropEnabled).toBe(false);
      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(0);
      expect(updatedDoc.state.global.status).toBe("CONFIRMED");
    });

    it("should handle reset scenario: add new document types from scratch", () => {
      const document = utils.createDocument();

      // Start with null allowedDocumentTypes
      expect(document.state.global.allowedDocumentTypes).toBeNull();

      // Add new types from scratch
      let updatedDoc = reducer(
        document,
        baseCreators.addDocumentType({
          documentType: "powerhouse/new1",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({
          documentType: "powerhouse/new2",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({
          documentType: "powerhouse/new3",
        }),
      );

      // Verify reset completed
      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(3);
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes(
          "powerhouse/new1",
        ),
      ).toBe(true);
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes(
          "powerhouse/new2",
        ),
      ).toBe(true);
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes(
          "powerhouse/new3",
        ),
      ).toBe(true);
    });

    it("should maintain state integrity with complex add/remove sequences", () => {
      const document = utils.createDocument();

      // Add multiple types
      let updatedDoc = reducer(
        document,
        baseCreators.addDocumentType({ documentType: "type-a" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({ documentType: "type-b" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({ documentType: "type-c" }),
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(3);

      // Remove middle one
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.removeDocumentType({ documentType: "type-b" }),
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(2);

      // Add it back with different name
      updatedDoc = reducer(
        updatedDoc,
        baseCreators.addDocumentType({ documentType: "type-b-new" }),
      );
      expect(updatedDoc.state.global.allowedDocumentTypes).toHaveLength(3);

      // Verify content
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes("type-a"),
      ).toBe(true);
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes("type-c"),
      ).toBe(true);
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes("type-b-new"),
      ).toBe(true);
      expect(
        updatedDoc.state.global.allowedDocumentTypes?.includes("type-b"),
      ).toBe(false);
    });
  });
});
