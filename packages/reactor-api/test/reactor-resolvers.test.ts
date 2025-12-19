import {
  ReactorBuilder,
  ReactorClientBuilder,
  type ReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as resolvers from "../src/graphql/reactor/resolvers.js";

const createTestDocument = (): PHDocument => {
  return documentModelDocumentModelModule.utils.createDocument();
};

describe("ReactorSubgraph Query Resolvers", () => {
  let module: ReactorClientModule;

  beforeEach(async () => {
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule as unknown as DocumentModelModule,
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withFeatures({ legacyStorageEnabled: false });

    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  describe("documentModels", () => {
    it("should transform document models to GraphQL format", async () => {
      const result = await resolvers.documentModels(module.client, {
        namespace: null,
        paging: { cursor: null, limit: 10 },
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0]).toHaveProperty("id");
      expect(result.items[0]).toHaveProperty("name");
    });

    it("should filter by namespace", async () => {
      const result = await resolvers.documentModels(module.client, {
        namespace: "powerhouse",
        paging: null,
      });

      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.id).toContain("powerhouse/");
      }
    });
  });

  describe("document", () => {
    it("should transform document to GraphQL format with revision list", async () => {
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const result = await resolvers.document(module.client, {
        identifier: testDoc.header.id,
      });

      expect(result.document).toBeDefined();
      expect(result.document.id).toBe(testDoc.header.id);
      expect(result.document.documentType).toBe("powerhouse/document-model");
      expect(result.document.revisionsList).toBeDefined();
      expect(Array.isArray(result.document.revisionsList)).toBe(true);
    });
  });

  describe("documentChildren", () => {
    it("should transform children documents to GraphQL format", async () => {
      const parent = createTestDocument();
      const child = createTestDocument();

      await module.client.create(parent);
      await module.client.create(child);
      await module.client.addChildren(parent.header.id, [child.header.id]);

      const result = await resolvers.documentChildren(module.client, {
        parentIdentifier: parent.header.id,
        paging: null,
        view: null,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(child.header.id);
    });
  });

  describe("documentParents", () => {
    it("should transform parent documents to GraphQL format", async () => {
      const parent = createTestDocument();
      const child = createTestDocument();

      await module.client.create(parent);
      await module.client.create(child);
      await module.client.addChildren(parent.header.id, [child.header.id]);

      const result = await resolvers.documentParents(module.client, {
        childIdentifier: child.header.id,
        paging: null,
        view: null,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(parent.header.id);
    });
  });

  describe("findDocuments", () => {
    it("should find documents by type", async () => {
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const result = await resolvers.findDocuments(module.client, {
        search: {
          type: "powerhouse/document-model",
          parentId: null,
        },
        paging: null,
        view: null,
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.items[0].documentType).toBe("powerhouse/document-model");
    });
  });

  describe("Error Handling", () => {
    it("should throw error for non-existent document", async () => {
      await expect(
        resolvers.document(module.client, { identifier: "non-existent-id" }),
      ).rejects.toThrow();
    });
  });
});

describe("ReactorSubgraph Mutation Resolvers", () => {
  let module: ReactorClientModule;

  beforeEach(async () => {
    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule as unknown as DocumentModelModule,
        documentModelDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withFeatures({ legacyStorageEnabled: false });

    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  describe("createDocument", () => {
    it("should create a document and transform to GraphQL format", async () => {
      const inputDocument = createTestDocument();

      const result = await resolvers.createDocument(module.client, {
        document: inputDocument,
        parentIdentifier: null,
      });

      expect(result.id).toBe(inputDocument.header.id);
      expect(result.documentType).toBe("powerhouse/document-model");
    });

    it("should reject invalid document input", async () => {
      await expect(
        resolvers.createDocument(module.client, {
          document: null,
          parentIdentifier: null,
        }),
      ).rejects.toThrow("Invalid document: must be an object");
    });

    it("should reject document without header", async () => {
      await expect(
        resolvers.createDocument(module.client, {
          document: { state: {} },
          parentIdentifier: null,
        }),
      ).rejects.toThrow("Invalid document: missing or invalid header");
    });
  });

  describe("createEmptyDocument", () => {
    it("should create an empty document of specified type", async () => {
      const result = await resolvers.createEmptyDocument(module.client, {
        documentType: "powerhouse/document-model",
        parentIdentifier: null,
      });

      expect(result.id).toBeDefined();
      expect(result.documentType).toBe("powerhouse/document-model");
    });
  });

  describe("renameDocument", () => {
    it("should rename a document", async () => {
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const result = await resolvers.renameDocument(module.client, {
        documentIdentifier: testDoc.header.id,
        name: "New Name",
        branch: null,
      });

      expect(result.name).toBe("New Name");
    });
  });

  describe("addChildren", () => {
    it("should add children to a parent document", async () => {
      const parent = createTestDocument();
      const child = createTestDocument();

      await module.client.create(parent);
      await module.client.create(child);

      const result = await resolvers.addChildren(module.client, {
        parentIdentifier: parent.header.id,
        documentIdentifiers: [child.header.id],
        branch: null,
      });

      expect(result.id).toBe(parent.header.id);
    });
  });

  describe("removeChildren", () => {
    it("should remove children from a parent document", async () => {
      const parent = createTestDocument();
      const child = createTestDocument();

      await module.client.create(parent);
      await module.client.create(child);
      await module.client.addChildren(parent.header.id, [child.header.id]);

      const result = await resolvers.removeChildren(module.client, {
        parentIdentifier: parent.header.id,
        documentIdentifiers: [child.header.id],
        branch: null,
      });

      expect(result.id).toBe(parent.header.id);
    });
  });

  describe("deleteDocument", () => {
    it("should delete a document", async () => {
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const result = await resolvers.deleteDocument(module.client, {
        identifier: testDoc.header.id,
        propagate: null,
      });

      expect(result).toBe(true);
    });
  });

  describe("deleteDocuments", () => {
    it("should delete multiple documents", async () => {
      const doc1 = createTestDocument();
      const doc2 = createTestDocument();

      await module.client.create(doc1);
      await module.client.create(doc2);

      const result = await resolvers.deleteDocuments(module.client, {
        identifiers: [doc1.header.id, doc2.header.id],
        propagate: null,
      });

      expect(result).toBe(true);
    });
  });

  describe("mutateDocument", () => {
    it("should mutate a document with validated actions", async () => {
      const testDoc = createTestDocument();
      await module.client.create(testDoc);

      const actions = [
        documentModelDocumentModelModule.actions.setModelName({
          name: "New Model Name",
        }),
      ];

      const result = await resolvers.mutateDocument(module.client, {
        documentIdentifier: testDoc.header.id,
        actions: actions,
        view: { branch: "main", scopes: null },
      });

      expect(result.id).toBe(testDoc.header.id);
    });
  });

  describe("Error Handling", () => {
    it("should handle rename errors", async () => {
      await expect(
        resolvers.renameDocument(module.client, {
          documentIdentifier: "non-existent-id",
          name: "New Name",
          branch: null,
        }),
      ).rejects.toThrow();
    });

    it("should handle delete errors", async () => {
      await expect(
        resolvers.deleteDocument(module.client, {
          identifier: "non-existent-id",
          propagate: null,
        }),
      ).rejects.toThrow();
    });
  });
});
