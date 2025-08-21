import { type DocumentModelDocument } from "../../index.js";
import {
  setAuthorName,
  setAuthorWebsite,
  setModelDescription,
  setModelExtension,
  setModelId,
  setModelName,
} from "../../src/document-model/gen/creators.js";
import { reducer, stateReducer } from "../../src/document-model/gen/reducer.js";
import { createDocument } from "../../src/document-model/gen/utils.js";
import { replayOperations } from "../../src/document/utils/base.js";
import { garbageCollectDocumentOperations } from "../../src/document/utils/document-helpers.js";

describe("Document Operations", () => {
  describe("Skip header operations", () => {
    it("should include skip param in base operations with default value to 0 if not provided", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }));
      document = reducer(document, setModelName({ name: "<name>" }));
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = reducer(document, setModelExtension({ extension: "phdm" }));
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = reducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in base operations with provided value", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }), undefined, {
        skip: 1,
        ignoreSkipOperations: true,
      });
      document = reducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = reducer(
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
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }));
      document = reducer(document, setModelName({ name: "<name>" }));
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = reducer(document, setModelExtension({ extension: "phdm" }));
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );

      expect(document.header.revision.global).toBe(5);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in module operations with provided value", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }), undefined, {
        skip: 1,
        ignoreSkipOperations: true,
      });
      document = reducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = reducer(
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
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }));
      document = reducer(document, setModelName({ name: "<name>" }));
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = reducer(document, setModelExtension({ extension: "phdm" }));
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = reducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );
      document = reducer(document, setModelId({ id: "<id2>" }));

      expect(document.header.revision.global).toBe(7);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in operation-error operations with provided value", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }), undefined, {
        skip: 1,
        ignoreSkipOperations: true,
      });
      document = reducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
        undefined,
        { skip: 6, ignoreSkipOperations: true },
      );
      document = reducer(document, setModelId({ id: "<id2>" }), undefined, {
        skip: 7,
        ignoreSkipOperations: true,
      });

      expect(document.header.revision.global).toBe(7);
      document.operations.global.forEach((op, index) => {
        expect(op).toHaveProperty("skip", index + 1);
      });
    });
  });

  describe("Skip operation-example operations", () => {
    it("should include skip param in operation-example operations with default value to 0 if not provided", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }));
      document = reducer(document, setModelName({ name: "<name>" }));
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = reducer(document, setModelExtension({ extension: "phdm" }));
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );

      expect(document.header.revision.global).toBe(5);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in operation-example operations with provided value", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }), undefined, {
        skip: 1,
        ignoreSkipOperations: true,
      });
      document = reducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = reducer(
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
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }));
      document = reducer(document, setModelName({ name: "<name>" }));
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = reducer(document, setModelExtension({ extension: "phdm" }));
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = reducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in operation operations with provided value", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }), undefined, {
        skip: 1,
        ignoreSkipOperations: true,
      });
      document = reducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = reducer(
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
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }));
      document = reducer(document, setModelName({ name: "<name>" }));
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = reducer(document, setModelExtension({ extension: "phdm" }));
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = reducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
      );

      expect(document.header.revision.global).toBe(6);
      document.operations.global.forEach((op) => {
        expect(op).toHaveProperty("skip", 0);
      });
    });

    it("should include skip param in object operations with provided value", () => {
      let document = createDocument();

      document = reducer(document, setModelId({ id: "<id>" }), undefined, {
        skip: 1,
        ignoreSkipOperations: true,
      });
      document = reducer(
        document,
        setModelName({ name: "<name>" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
        undefined,
        { skip: 3, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 4, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
        undefined,
        { skip: 5, ignoreSkipOperations: true },
      );
      document = reducer(
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
      let document = createDocument();

      document = reducer(
        document,
        setModelDescription({ description: "<description>" }),
      );
      document = reducer(document, setModelName({ name: "<name>" }));
      document = reducer(
        document,
        setModelExtension({ extension: "phdm" }),
        undefined,
        { skip: 2, ignoreSkipOperations: true },
      );
      document = reducer(
        document,
        setAuthorName({ authorName: "<authorName>" }),
      );
      document = reducer(
        document,
        setAuthorWebsite({ authorWebsite: "<authorWebsite>" }),
        undefined,
        { skip: 1, ignoreSkipOperations: true },
      );
      document = reducer(document, setModelId({ id: "<id>" }));

      const replayedDoc = replayOperations<DocumentModelDocument>(
        document.initialState,
        garbageCollectDocumentOperations(document.operations),
        stateReducer,
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
