import type { DocumentModelDocument } from "document-model";
import {
  documentModelCreateDocument,
  documentModelReducer,
  documentModelStateReducer,
  garbageCollectDocumentOperations,
  replayOperations,
  setAuthorName,
  setAuthorWebsite,
  setModelDescription,
  setModelExtension,
  setModelId,
  setModelName,
} from "document-model";
import { expect } from "vitest";

describe("Document Operations", () => {
  describe("Skip header operations", () => {
    it("should include skip param in base operations with default value to 0 if not provided", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(document, setModelId({ id: "<id>" }));
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in base operations with provided value", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(
        document,
        setModelId({ id: "<id>" }),
        undefined,
        {
          skip: 1,
          ignoreSkipOperations: true,
        },
      );
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
        undefined,
        { skip: 6, ignoreSkipOperations: true },
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("Skip module operations", () => {
    it("should include skip param in module operations with default value to 0 if not provided", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(document, setModelId({ id: "<id>" }));
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );

      expect(document.header.revision.global).toBe(5);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in module operations with provided value", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(
        document,
        setModelId({ id: "<id>" }),
        undefined,
        {
          skip: 1,
          ignoreSkipOperations: true,
        },
      );
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );

      expect(document.header.revision.global).toBe(5);
      document.operations.global.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("Skip operation-error operations", () => {
    it("should include skip param in operation-error operations with default value to 0 if not provided", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(document, setModelId({ id: "<id>" }));
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );
      document = documentModelReducer(document, setModelId({ id: "<id2>" }));

      expect(document.header.revision.global).toBe(7);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in operation-error operations with provided value", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(
        document,
        setModelId({ id: "<id>" }),
        undefined,
        {
          skip: 1,
          ignoreSkipOperations: true,
        },
      );
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
        undefined,
        { skip: 6, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelId({ id: "<id2>" }),
        undefined,
        {
          skip: 7,
          ignoreSkipOperations: true,
        },
      );

      expect(document.header.revision.global).toBe(7);
      document.operations.global.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("Skip operation-example operations", () => {
    it("should include skip param in operation-example operations with default value to 0 if not provided", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(document, setModelId({ id: "<id>" }));
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );

      expect(document.header.revision.global).toBe(5);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in operation-example operations with provided value", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(
        document,
        setModelId({ id: "<id>" }),
        undefined,
        {
          skip: 1,
          ignoreSkipOperations: true,
        },
      );
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );

      expect(document.header.revision.global).toBe(5);
      document.operations.global.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("Skip operation operations", () => {
    it("should include skip param in operation operations with default value to 0 if not provided", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(document, setModelId({ id: "<id>" }));
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in operation operations with provided value", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(
        document,
        setModelId({ id: "<id>" }),
        undefined,
        {
          skip: 1,
          ignoreSkipOperations: true,
        },
      );
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
        undefined,
        { skip: 6, ignoreSkipOperations: true },
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("Skip object operations", () => {
    it("should include skip param in object operations with default value to 0 if not provided", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(document, setModelId({ id: "<id>" }));
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in object operations with provided value", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(
        document,
        setModelId({ id: "<id>" }),
        undefined,
        {
          skip: 1,
          ignoreSkipOperations: true,
        },
      );
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
        undefined,
        { skip: 6, ignoreSkipOperations: true },
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("state replayOperations", () => {
    it("skipped operations should be ignored when re-calculate document state", () => {
      let document = documentModelCreateDocument();

      document = documentModelReducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = documentModelReducer(
        document,
        setModelName({ name: "<name>" }),
      );
      document = documentModelReducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = documentModelReducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = documentModelReducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
        undefined,
        { skip: 1, ignoreSkipOperations: true },
      );
      document = documentModelReducer(document, setModelId({ id: "<id>" }));

      const replayedDoc = replayOperations<DocumentModelDocument>(
        document.initialState,
        garbageCollectDocumentOperations(document.operations),
        documentModelStateReducer,
      );

      expect(replayedDoc.header.revision.global).toBe(6);
      expect(replayedDoc.operations.global.length).toBe(3);
      expect(replayedDoc.state.global).toMatchObject({
        id: "<id>",
        name: "",
        extension: "phdm",
        description: "",
        author: { name: "", website: "<authorWebsite>" },
      });
    });
  });
});
