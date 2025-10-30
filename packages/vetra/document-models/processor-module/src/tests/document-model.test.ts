/**
 * This is a scaffold file meant for customization:
 * - change it by adding new tests or modifying the existing ones
 */

import {
  addDocumentType,
  reducer,
  removeDocumentType,
  setProcessorName,
  setProcessorStatus,
  setProcessorType,
  utils,
} from "@powerhousedao/vetra/document-models/processor-module";
import { describe, expect, it } from "vitest";

describe("Processor Module Document Model", () => {
  it("should have correct initial values", () => {
    const document = utils.createDocument();

    expect(document.state.global.name).toBe("");
    expect(document.state.global.type).toBe("");
    expect(document.state.global.documentTypes).toEqual([]);
    expect(document.state.global.status).toBe("DRAFT");
  });

  it("should handle multiple operations and maintain consistency", () => {
    const document = utils.createDocument();

    let updatedDoc = reducer(
      document,
      setProcessorName({ name: "Test Processor" }),
    );
    updatedDoc = reducer(updatedDoc, setProcessorType({ type: "analytics" }));
    updatedDoc = reducer(
      updatedDoc,
      addDocumentType({
        id: "test-type",
        documentType: "powerhouse/test",
      }),
    );
    updatedDoc = reducer(
      updatedDoc,
      setProcessorStatus({ status: "CONFIRMED" }),
    );

    // Verify state consistency
    expect(updatedDoc.state.global.name).toBe("Test Processor");
    expect(updatedDoc.state.global.type).toBe("analytics");
    expect(updatedDoc.state.global.documentTypes).toHaveLength(1);
    expect(updatedDoc.state.global.status).toBe("CONFIRMED");
  });

  describe("Complex Scenarios", () => {
    it("should handle workflow: set name/type, add types, confirm status", () => {
      const document = utils.createDocument();

      // Step 1: Set processor name and type
      let updatedDoc = reducer(
        document,
        setProcessorName({ name: "Production Processor" }),
      );
      expect(updatedDoc.state.global.name).toBe("Production Processor");

      updatedDoc = reducer(
        updatedDoc,
        setProcessorType({ type: "data-analytics" }),
      );
      expect(updatedDoc.state.global.type).toBe("data-analytics");

      // Step 2: Add document types
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "budget-docs",
          documentType: "powerhouse/budget",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "invoice-docs",
          documentType: "powerhouse/invoice",
        }),
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(2);

      // Step 3: Confirm processor status
      updatedDoc = reducer(
        updatedDoc,
        setProcessorStatus({ status: "CONFIRMED" }),
      );
      expect(updatedDoc.state.global.status).toBe("CONFIRMED");
    });

    it("should handle reset scenario: remove all types and add new ones", () => {
      const document = utils.createDocument();

      // Add initial types
      let updatedDoc = reducer(
        document,
        addDocumentType({
          id: "old-type-1",
          documentType: "powerhouse/old1",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "old-type-2",
          documentType: "powerhouse/old2",
        }),
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(2);

      // Remove all types
      updatedDoc = reducer(
        updatedDoc,
        removeDocumentType({ id: "old-type-1" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        removeDocumentType({ id: "old-type-2" }),
      );
      expect(updatedDoc.state.global.documentTypes).toEqual([]);

      // Add new types from scratch
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "new-type-1",
          documentType: "powerhouse/new1",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "new-type-2",
          documentType: "powerhouse/new2",
        }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({
          id: "new-type-3",
          documentType: "powerhouse/new3",
        }),
      );

      // Verify reset completed
      expect(updatedDoc.state.global.documentTypes).toHaveLength(3);
      expect(
        updatedDoc.state.global.documentTypes.find(
          (dt) => dt.id === "old-type-1",
        ),
      ).toBeUndefined();
      expect(
        updatedDoc.state.global.documentTypes.find(
          (dt) => dt.id === "new-type-1",
        ),
      ).toBeDefined();
    });

    it("should maintain state integrity with complex add/remove sequences", () => {
      const document = utils.createDocument();

      // Add multiple types
      let updatedDoc = reducer(
        document,
        addDocumentType({ id: "type-a", documentType: "a" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({ id: "type-b", documentType: "b" }),
      );
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({ id: "type-c", documentType: "c" }),
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(3);

      // Remove middle one
      updatedDoc = reducer(updatedDoc, removeDocumentType({ id: "type-b" }));
      expect(updatedDoc.state.global.documentTypes).toHaveLength(2);

      // Add it back with new documentType
      updatedDoc = reducer(
        updatedDoc,
        addDocumentType({ id: "type-b", documentType: "b-new" }),
      );
      expect(updatedDoc.state.global.documentTypes).toHaveLength(3);

      // Verify order and content
      const typeB = updatedDoc.state.global.documentTypes.find(
        (dt) => dt.id === "type-b",
      );
      expect(typeB?.documentType).toBe("b-new");
    });
  });
});
