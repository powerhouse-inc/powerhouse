import { driveDocumentModelModule } from "document-drive";
import { actions, documentModelDocumentModelModule } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import type { JobWriteReadyEvent } from "../../src/events/types.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import { JobStatus, PropagationMode } from "../../src/shared/types.js";
import type { IDocumentIndexer } from "../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../src/storage/kysely/document-indexer.js";
import type { Database } from "../../src/storage/kysely/types.js";
import {
  createDocModelDocument,
  createMockSigner,
  createTestOperationStore,
} from "../factories.js";

describe("ReactorClient Integration Tests", () => {
  let client: IReactorClient;
  let reactor: IReactor;
  let documentIndexer: IDocumentIndexer;
  let db: Kysely<Database>;
  let eventBus: IEventBus;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db as unknown as Kysely<Database>;
    const operationStore = setup.store;

    eventBus = new EventBus();

    const documentIndexerConsistencyTracker = new ConsistencyTracker();
    documentIndexer = new KyselyDocumentIndexer(
      db as any,
      operationStore,
      documentIndexerConsistencyTracker,
    );
    await documentIndexer.init();

    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule as any,
        documentModelDocumentModelModule,
      ])
      .withReadModel(documentIndexer)
      .withEventBus(eventBus);
    client = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .build();

    reactor = (client as any).reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  describe("Document Retrieval", () => {
    describe("getDocumentModels", () => {
      it("should retrieve all document models", async () => {
        const result = await client.getDocumentModelModules();

        expect(result.results.length).toBeGreaterThan(0);
        expect(result.results[0]).toHaveProperty("documentModel");
      });

      it("should filter by namespace", async () => {
        const result = await client.getDocumentModelModules("powerhouse");

        expect(result.results.length).toBeGreaterThan(0);
        result.results.forEach((model) => {
          expect(model.documentModel.global.id).toContain("powerhouse");
        });
      });

      it("should support pagination", async () => {
        const firstPage = await client.getDocumentModelModules(undefined, {
          cursor: "",
          limit: 1,
        });

        expect(firstPage.results.length).toBe(1);
        expect(firstPage.options.cursor).toBeDefined();
      });
    });

    describe("get", () => {
      it("should retrieve a document by ID", async () => {
        const testDoc = createDocModelDocument({ id: "test-doc-1" });
        await client.create(testDoc);

        const result = await client.get("test-doc-1");

        expect(result.header.id).toBe("test-doc-1");
      });

      it("should retrieve a document by slug", async () => {
        const testDoc = createDocModelDocument({
          id: "test-doc-2",
          slug: "my-test-doc",
        });
        await client.create(testDoc);

        const result = await client.get("my-test-doc");

        expect(result.header.slug).toBe("my-test-doc");
        expect(result.header.id).toBe("test-doc-2");
      });

      it("should support view filters", async () => {
        const testDoc = createDocModelDocument({ id: "test-doc-3" });
        await client.create(testDoc);

        const result = await client.get("test-doc-3", { branch: "main" });

        expect(result.header.id).toBe("test-doc-3");
      });

      it("should throw error for non-existent document", async () => {
        await expect(client.get("non-existent-id")).rejects.toThrow();
      });
    });

    describe("getChildren", () => {
      it("should retrieve children of a parent document", async () => {
        const parent = createDocModelDocument({ id: "parent-1" });
        const child1 = createDocModelDocument({ id: "child-1" });
        const child2 = createDocModelDocument({ id: "child-2" });

        await client.create(parent);
        await client.create(child1, "parent-1");
        await client.create(child2, "parent-1");

        const result = await client.getChildren("parent-1");

        expect(result.results.length).toBe(2);
        const childIds = result.results.map((doc) => doc.header.id);
        expect(childIds).toContain("child-1");
        expect(childIds).toContain("child-2");
      });

      it("should return empty results for parent with no children", async () => {
        const parent = createDocModelDocument({ id: "lonely-parent" });
        await client.create(parent);

        const result = await client.getChildren("lonely-parent");

        expect(result.results.length).toBe(0);
      });

      it("should support pagination", async () => {
        const parent = createDocModelDocument({ id: "parent-2" });
        await client.create(parent);

        for (let i = 0; i < 5; i++) {
          const child = createDocModelDocument({ id: `child-${i}` });
          await client.create(child, "parent-2");
        }

        const firstPage = await client.getChildren("parent-2", undefined, {
          cursor: "",
          limit: 2,
        });

        expect(firstPage.results.length).toBe(2);
        expect(firstPage.options.cursor).toBeDefined();
      });
    });

    describe("getParents", () => {
      it("should retrieve parents of a child document", async () => {
        const parent1 = createDocModelDocument({ id: "parent-a" });
        const parent2 = createDocModelDocument({ id: "parent-b" });
        const child = createDocModelDocument({ id: "shared-child" });

        await client.create(parent1);
        await client.create(parent2);
        await client.create(child, "parent-a");
        await client.addChildren("parent-b", ["shared-child"]);

        const result = await client.getParents("shared-child");

        expect(result.results.length).toBe(2);
        const parentIds = result.results.map((doc) => doc.header.id);
        expect(parentIds).toContain("parent-a");
        expect(parentIds).toContain("parent-b");
      });

      it("should return empty results for document with no parents", async () => {
        const orphan = createDocModelDocument({ id: "orphan-doc" });
        await client.create(orphan);

        const result = await client.getParents("orphan-doc");

        expect(result.results.length).toBe(0);
      });
    });

    describe("find", () => {
      it("should find documents by type", async () => {
        const doc1 = createDocModelDocument({ id: "doc-type-1" });
        const doc2 = createDocModelDocument({ id: "doc-type-2" });

        await client.create(doc1);
        await client.create(doc2);

        const result = await client.find({
          type: "powerhouse/document-model",
        });

        expect(result.results.length).toBeGreaterThanOrEqual(2);
      });

      it("should find documents by IDs", async () => {
        const doc1 = createDocModelDocument({ id: "find-id-1" });
        const doc2 = createDocModelDocument({ id: "find-id-2" });

        await client.create(doc1);
        await client.create(doc2);

        const result = await client.find({
          ids: ["find-id-1", "find-id-2"],
        });

        expect(result.results.length).toBe(2);
        const ids = result.results.map((doc) => doc.header.id);
        expect(ids).toContain("find-id-1");
        expect(ids).toContain("find-id-2");
      });

      it("should find documents by parent ID", async () => {
        const parent = createDocModelDocument({ id: "find-parent" });
        const child1 = createDocModelDocument({ id: "find-child-1" });
        const child2 = createDocModelDocument({ id: "find-child-2" });

        await client.create(parent);
        await client.create(child1, "find-parent");
        await client.create(child2, "find-parent");

        const result = await client.find({ parentId: "find-parent" });

        expect(result.results.length).toBe(2);
      });

      it("should support pagination", async () => {
        for (let i = 0; i < 3; i++) {
          const doc = createDocModelDocument({ id: `paginate-${i}` });
          await client.create(doc);
        }

        const result = await client.find(
          { type: "powerhouse/document-model" },
          undefined,
          { cursor: "", limit: 2 },
        );

        expect(result.results.length).toBeGreaterThan(0);
        expect(result.options.cursor).toBeDefined();
      });

      it("should return empty results when no documents match", async () => {
        const result = await client.find({ ids: ["non-existent-id"] });

        expect(result.results.length).toBe(0);
      });
    });
  });

  describe("Document Creation", () => {
    describe("create", () => {
      it("should create a document", async () => {
        const doc = createDocModelDocument({ id: "create-test-1" });

        const result = await client.create(doc);

        expect(result.header.id).toBe("create-test-1");
      });

      it("should create a document with a parent", async () => {
        const parent = createDocModelDocument({ id: "create-parent" });
        const child = createDocModelDocument({ id: "create-child" });

        await client.create(parent);
        const result = await client.create(child, "create-parent");

        expect(result.header.id).toBe("create-child");

        const children = await client.getChildren("create-parent");
        expect(children.results.length).toBe(1);
        expect(children.results[0].header.id).toBe("create-child");
      });

      it("should batch document creation with parent relationship via executeBatch", async () => {
        const parent = createDocModelDocument({ id: "batch-parent" });
        await client.create(parent);

        let completedBatchId = "";
        let batchJobIds: string[] = [];
        const seenJobIds = new Set<string>();

        const batchCompletedPromise = new Promise<void>((resolve) => {
          const unsubscribe = eventBus.subscribe<JobWriteReadyEvent>(
            ReactorEventTypes.JOB_WRITE_READY,
            (_type, event) => {
              const meta = event.jobMeta as
                | { batchId?: string; batchJobIds?: string[] }
                | undefined;
              if (!meta?.batchId || !meta?.batchJobIds) {
                return;
              }

              seenJobIds.add(event.jobId);

              const allSeen = meta.batchJobIds.every((id) =>
                seenJobIds.has(id),
              );
              if (allSeen) {
                completedBatchId = meta.batchId;
                batchJobIds = meta.batchJobIds;
                unsubscribe();
                resolve();
              }
            },
          );
        });

        const child = createDocModelDocument({ id: "batch-child" });
        const result = await client.create(child, "batch-parent");
        await batchCompletedPromise;

        expect(result.header.id).toBe("batch-child");
        expect(completedBatchId).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        );
        expect(batchJobIds.length).toBe(2);

        const children = await client.getChildren("batch-parent");
        expect(children.results.length).toBe(1);
        expect(children.results[0].header.id).toBe("batch-child");
      });

      it("should wait for job completion", async () => {
        const doc = createDocModelDocument({ id: "create-wait-test" });

        const result = await client.create(doc);

        expect(result.header.id).toBe("create-wait-test");
        const retrieved = await client.get("create-wait-test");
        expect(retrieved.header.id).toBe("create-wait-test");
      });

      it("should sign CREATE_DOCUMENT and UPGRADE_DOCUMENT actions", async () => {
        const mockSigner = createMockSigner();
        const setup = await createTestOperationStore();
        const db = setup.db as unknown as Kysely<Database>;
        const operationStore = setup.store;

        const documentIndexerConsistencyTracker = new ConsistencyTracker();
        const testDocumentIndexer = new KyselyDocumentIndexer(
          db as any,
          operationStore,
          documentIndexerConsistencyTracker,
        );
        await testDocumentIndexer.init();

        const eventBus = new EventBus();
        const reactorBuilder = new ReactorBuilder()
          .withDocumentModels([
            driveDocumentModelModule as any,
            documentModelDocumentModelModule,
          ])
          .withReadModel(testDocumentIndexer)
          .withEventBus(eventBus);
        const signingClient = await new ReactorClientBuilder()
          .withReactorBuilder(reactorBuilder)
          .withSigner(mockSigner)
          .build();

        const signingReactor = (signingClient as any).reactor as IReactor;

        const doc = createDocModelDocument({ id: "signing-test-doc" });
        await signingClient.create(doc);

        const operations =
          await signingReactor.getOperations("signing-test-doc");

        expect(operations.document.results.length).toBeGreaterThanOrEqual(2);

        const createDocOp = operations.document.results.find(
          (op) => op.action.type === "CREATE_DOCUMENT",
        );
        const upgradeDocOp = operations.document.results.find(
          (op) => op.action.type === "UPGRADE_DOCUMENT",
        );

        expect(createDocOp).toBeDefined();
        expect(upgradeDocOp).toBeDefined();

        expect(createDocOp?.action.context?.signer).toBeDefined();
        expect(createDocOp?.action.context?.signer?.signatures).toHaveLength(1);
        expect(createDocOp?.action.context?.signer?.signatures[0][0]).toBe(
          "mock-signature",
        );

        expect(upgradeDocOp?.action.context?.signer).toBeDefined();
        expect(upgradeDocOp?.action.context?.signer?.signatures).toHaveLength(
          1,
        );
        expect(upgradeDocOp?.action.context?.signer?.signatures[0][0]).toBe(
          "mock-signature",
        );
        signingReactor.kill();
      });
    });

    describe("createEmpty", () => {
      it("should create an empty document of specified type", async () => {
        const result = await client.createEmpty("powerhouse/document-model");

        expect(result.header.documentType).toBe("powerhouse/document-model");
        expect(result.header.id).toBeDefined();
      });

      it("should create an empty document with a parent", async () => {
        const parent = createDocModelDocument({ id: "empty-parent" });
        await client.create(parent);

        const result = await client.createEmpty("powerhouse/document-model", {
          parentIdentifier: "empty-parent",
        });

        expect(result.header.documentType).toBe("powerhouse/document-model");

        const children = await client.getChildren("empty-parent");
        expect(children.results.length).toBe(1);
        expect(children.results[0].header.id).toBe(result.header.id);
      });
    });
  });

  describe("Document Mutation", () => {
    describe("execute", () => {
      it("should apply actions to a document and wait for completion", async () => {
        const doc = createDocModelDocument({ id: "mutate-test-1" });
        await client.create(doc);

        const actionsToApply = [actions.setName("Updated Name")];

        const result = await client.execute(
          "mutate-test-1",
          "main",
          actionsToApply,
        );

        expect(result.header.id).toBe("mutate-test-1");
        expect(result.header.name).toBe("Updated Name");
      });

      it("should handle multiple actions", async () => {
        const doc = createDocModelDocument({ id: "mutate-test-2" });
        await client.create(doc);

        const actionsToApply = [
          actions.setName("First Update"),
          actions.setName("Final Update"),
        ];

        const result = await client.execute(
          "mutate-test-2",
          "main",
          actionsToApply,
        );

        expect(result.header.id).toBe("mutate-test-2");
        expect(result.header.name).toBe("Final Update");
      });
    });

    describe("executeAsync", () => {
      it("should return immediately with job info", async () => {
        const doc = createDocModelDocument({ id: "mutate-async-1" });
        await client.create(doc);

        const actionsToApply = [actions.setName("Async Update")];

        const jobInfo = await client.executeAsync(
          "mutate-async-1",
          "main",
          actionsToApply,
        );

        expect(jobInfo.id).toBeDefined();
        expect(jobInfo.status).toBeDefined();

        await client.waitForJob(jobInfo);

        const result = await client.get("mutate-async-1");
        expect(result.header.id).toBe("mutate-async-1");
        expect(result.header.name).toBe("Async Update");
      });
    });

    describe("rename", () => {
      it("should rename a document", async () => {
        const doc = createDocModelDocument({ id: "rename-test-1" });
        await client.create(doc);

        const result = await client.rename(
          "rename-test-1",
          "New Document Name",
        );

        expect(result.header.id).toBe("rename-test-1");
        expect(result.header.name).toBe("New Document Name");
      });

      it("should support view filters", async () => {
        const doc = createDocModelDocument({ id: "rename-test-2" });
        await client.create(doc);

        const result = await client.rename(
          "rename-test-2",
          "Named with View",
          "main",
        );

        expect(result.header.id).toBe("rename-test-2");
        expect(result.header.name).toBe("Named with View");
      });
    });
  });

  describe("Relationship Management", () => {
    describe("addChildren", () => {
      it("should add a single child to a parent", async () => {
        const parent = createDocModelDocument({ id: "add-parent-1" });
        const child = createDocModelDocument({ id: "add-child-1" });

        await client.create(parent);
        await client.create(child);

        const result = await client.addChildren("add-parent-1", [
          "add-child-1",
        ]);

        expect(result.header.id).toBe("add-parent-1");

        const children = await client.getChildren("add-parent-1");
        expect(children.results.length).toBe(1);
        expect(children.results[0].header.id).toBe("add-child-1");
      });

      it("should add multiple children to a parent", async () => {
        const parent = createDocModelDocument({ id: "add-parent-2" });
        const child1 = createDocModelDocument({ id: "add-child-2a" });
        const child2 = createDocModelDocument({ id: "add-child-2b" });
        const child3 = createDocModelDocument({ id: "add-child-2c" });

        await client.create(parent);
        await client.create(child1);
        await client.create(child2);
        await client.create(child3);

        await client.addChildren("add-parent-2", [
          "add-child-2a",
          "add-child-2b",
          "add-child-2c",
        ]);

        const children = await client.getChildren("add-parent-2");
        expect(children.results.length).toBe(3);
      });
    });

    describe("removeChildren", () => {
      it("should remove a single child from a parent", async () => {
        const parent = createDocModelDocument({ id: "remove-parent-1" });
        const child = createDocModelDocument({ id: "remove-child-1" });

        await client.create(parent);
        await client.create(child, "remove-parent-1");

        await client.removeChildren("remove-parent-1", ["remove-child-1"]);

        const children = await client.getChildren("remove-parent-1");
        expect(children.results.length).toBe(0);
      });

      it("should remove multiple children from a parent", async () => {
        const parent = createDocModelDocument({ id: "remove-parent-2" });
        const child1 = createDocModelDocument({ id: "remove-child-2a" });
        const child2 = createDocModelDocument({ id: "remove-child-2b" });
        const child3 = createDocModelDocument({ id: "remove-child-2c" });

        await client.create(parent);
        await client.create(child1, "remove-parent-2");
        await client.create(child2, "remove-parent-2");
        await client.create(child3, "remove-parent-2");

        await client.removeChildren("remove-parent-2", [
          "remove-child-2a",
          "remove-child-2c",
        ]);

        const children = await client.getChildren("remove-parent-2");
        expect(children.results.length).toBe(1);
        expect(children.results[0].header.id).toBe("remove-child-2b");
      });
    });

    describe("moveChildren", () => {
      it("should move children between parents", async () => {
        const parent1 = createDocModelDocument({ id: "move-parent-1" });
        const parent2 = createDocModelDocument({ id: "move-parent-2" });
        const child1 = createDocModelDocument({ id: "move-child-1" });
        const child2 = createDocModelDocument({ id: "move-child-2" });

        await client.create(parent1);
        await client.create(parent2);
        await client.create(child1, "move-parent-1");
        await client.create(child2, "move-parent-1");

        await client.moveChildren("move-parent-1", "move-parent-2", [
          "move-child-1",
          "move-child-2",
        ]);

        const parent1Children = await client.getChildren("move-parent-1");
        expect(parent1Children.results.length).toBe(0);

        const parent2Children = await client.getChildren("move-parent-2");
        expect(parent2Children.results.length).toBe(2);
      });
    });
  });

  describe("Document Deletion", () => {
    describe("deleteDocument", () => {
      it("should delete a single document", async () => {
        const doc = createDocModelDocument({ id: "delete-test-1" });
        await client.create(doc);

        await client.deleteDocument("delete-test-1");

        const result = await client.get("delete-test-1");
        expect(result.initialState.document.isDeleted).toBe(true);
      });

      it("should delete with propagation mode", async () => {
        const root = createDocModelDocument({ id: "cascade-root" });
        const child1 = createDocModelDocument({ id: "cascade-child-1" });
        const child2 = createDocModelDocument({ id: "cascade-child-2" });
        const grandchild1 = createDocModelDocument({
          id: "cascade-grandchild-1",
        });
        const grandchild2 = createDocModelDocument({
          id: "cascade-grandchild-2",
        });
        const grandchild3 = createDocModelDocument({
          id: "cascade-grandchild-3",
        });
        const greatGrandchild = createDocModelDocument({
          id: "cascade-great-grandchild",
        });

        await client.create(root);
        await client.create(child1, "cascade-root");
        await client.create(child2, "cascade-root");
        await client.create(grandchild1, "cascade-child-1");
        await client.create(grandchild2, "cascade-child-1");
        await client.create(grandchild3, "cascade-child-2");
        await client.create(greatGrandchild, "cascade-grandchild-1");

        await client.deleteDocument("cascade-root", PropagationMode.Cascade);

        const rootResult = await client.get("cascade-root");
        expect(rootResult.initialState.document.isDeleted).toBe(true);

        const child1Result = await client.get("cascade-child-1");
        expect(child1Result.initialState.document.isDeleted).toBe(true);

        const child2Result = await client.get("cascade-child-2");
        expect(child2Result.initialState.document.isDeleted).toBe(true);

        const grandchild1Result = await client.get("cascade-grandchild-1");
        expect(grandchild1Result.initialState.document.isDeleted).toBe(true);

        const grandchild2Result = await client.get("cascade-grandchild-2");
        expect(grandchild2Result.initialState.document.isDeleted).toBe(true);

        const grandchild3Result = await client.get("cascade-grandchild-3");
        expect(grandchild3Result.initialState.document.isDeleted).toBe(true);

        const greatGrandchildResult = await client.get(
          "cascade-great-grandchild",
        );
        expect(greatGrandchildResult.initialState.document.isDeleted).toBe(
          true,
        );
      });
    });

    describe("deleteDocuments", () => {
      it("should delete multiple documents", async () => {
        const doc1 = createDocModelDocument({ id: "delete-multi-1" });
        const doc2 = createDocModelDocument({ id: "delete-multi-2" });
        const doc3 = createDocModelDocument({ id: "delete-multi-3" });

        await client.create(doc1);
        await client.create(doc2);
        await client.create(doc3);

        await client.deleteDocuments(["delete-multi-1", "delete-multi-2"]);

        const doc1Result = await client.get("delete-multi-1");
        expect(doc1Result.initialState.document.isDeleted).toBe(true);

        const doc2Result = await client.get("delete-multi-2");
        expect(doc2Result.initialState.document.isDeleted).toBe(true);

        const doc3Result = await client.get("delete-multi-3");
        expect(doc3Result.header.id).toBe("delete-multi-3");
        expect(doc3Result.initialState.document.isDeleted || false).toBe(false);
      });

      it("should delete with propagation mode", async () => {
        const parent1 = createDocModelDocument({ id: "delete-multi-parent-1" });
        const parent2 = createDocModelDocument({ id: "delete-multi-parent-2" });
        const child1 = createDocModelDocument({ id: "delete-multi-child-1" });
        const child2 = createDocModelDocument({ id: "delete-multi-child-2" });

        await client.create(parent1);
        await client.create(parent2);
        await client.create(child1, "delete-multi-parent-1");
        await client.create(child2, "delete-multi-parent-2");

        await client.deleteDocuments(
          ["delete-multi-parent-1", "delete-multi-parent-2"],
          PropagationMode.Cascade,
        );

        const parent1Result = await client.get("delete-multi-parent-1");
        expect(parent1Result.initialState.document.isDeleted).toBe(true);

        const parent2Result = await client.get("delete-multi-parent-2");
        expect(parent2Result.initialState.document.isDeleted).toBe(true);

        const child1Result = await client.get("delete-multi-child-1");
        expect(child1Result.initialState.document.isDeleted).toBe(true);

        const child2Result = await client.get("delete-multi-child-2");
        expect(child2Result.initialState.document.isDeleted).toBe(true);
      });
    });
  });

  describe("Job Management", () => {
    describe("getJobStatus", () => {
      it("should retrieve job status by ID", async () => {
        const doc = createDocModelDocument({ id: "job-status-test" });
        await client.create(doc);

        const jobInfo = await client.executeAsync("job-status-test", "main", [
          {
            type: "SET_NAME",
            input: { name: "Test" },
            scope: "global",
          } as any,
        ]);

        const status = await client.getJobStatus(jobInfo.id);

        expect(status.id).toBe(jobInfo.id);
        expect(status.status).toBeDefined();
      });

      it("should support abort signal", async () => {
        const doc = createDocModelDocument({ id: "job-signal-test" });
        await client.create(doc);

        const jobInfo = await client.executeAsync("job-signal-test", "main", [
          {
            type: "SET_NAME",
            input: { name: "Test" },
            scope: "global",
          } as any,
        ]);

        const controller = new AbortController();
        const statusPromise = client.getJobStatus(
          jobInfo.id,
          controller.signal,
        );

        const status = await statusPromise;
        expect(status.id).toBe(jobInfo.id);
      });
    });

    describe("waitForJob", () => {
      it("should wait for job completion with job ID string", async () => {
        const doc = createDocModelDocument({ id: "wait-job-1" });
        await client.create(doc);

        const actionsToApply = [actions.setName("Waited")];

        const jobInfo = await client.executeAsync(
          "wait-job-1",
          "main",
          actionsToApply,
        );

        const result = await client.waitForJob(jobInfo.id);

        expect(result.status).toBe(JobStatus.READ_READY);
      });

      it("should wait for job completion with JobInfo object", async () => {
        const doc = createDocModelDocument({ id: "wait-job-2" });
        await client.create(doc);

        const actionsToApply = [actions.setName("Waited")];

        const jobInfo = await client.executeAsync(
          "wait-job-2",
          "main",
          actionsToApply,
        );

        const result = await client.waitForJob(jobInfo);

        expect(result.status).toBe(JobStatus.READ_READY);
      });
    });
  });

  describe("Subscriptions", () => {
    it("should allow subscribing to document changes", () => {
      const unsubscribe = client.subscribe({}, () => {});

      expect(unsubscribe).toBeTypeOf("function");

      unsubscribe();
    });
  });

  describe("Error Handling", () => {
    it("should handle non-existent document ID in get", async () => {
      await expect(client.get("non-existent-id")).rejects.toThrow();
    });

    it("should handle non-existent parent in addChildren", async () => {
      const child = createDocModelDocument({ id: "orphan-child" });
      await client.create(child);

      await expect(
        client.addChildren("non-existent-parent", ["orphan-child"]),
      ).rejects.toThrow();
    });

    it("should handle abort signal in get", async () => {
      const doc = createDocModelDocument({ id: "abort-test" });
      await client.create(doc);

      const controller = new AbortController();
      controller.abort();

      await expect(
        client.get("abort-test", undefined, controller.signal),
      ).rejects.toThrow();
    });

    it("should handle abort signal in create", async () => {
      const doc = createDocModelDocument({ id: "abort-create-test" });
      const controller = new AbortController();
      controller.abort();

      await expect(
        client.create(doc, undefined, controller.signal),
      ).rejects.toThrow();
    });
  });

  describe("createDocumentInDrive", () => {
    it("should create a document in a drive with proper scoping", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();
      await client.create(drive);

      const doc = documentModelDocumentModelModule.utils.createDocument();
      doc.header.name = "My New Document";
      const createdDoc = await client.createDocumentInDrive(
        drive.header.id,
        doc,
      );

      expect(createdDoc).toBeDefined();
      expect(createdDoc.header.name).toBe("My New Document");
      expect(createdDoc.header.documentType).toBe("powerhouse/document-model");

      const driveResult = await client.get(drive.header.id);
      const driveState = driveResult.state as any;
      const files = driveState.global.nodes || [];
      const addedFile = files.find((n: any) => n.id === createdDoc.header.id);
      expect(addedFile).toBeDefined();
      expect(addedFile.name).toBe("My New Document");
    });

    it("should emit JOB_WRITE_READY events with batch metadata that allows detecting batch completion", async () => {
      const drive = driveDocumentModelModule.utils.createDocument();
      await client.create(drive);

      let completedBatchId = "";
      let batchJobIds: string[] = [];
      const seenJobIds = new Set<string>();

      const batchCompletedPromise = new Promise<void>((resolve) => {
        const unsubscribe = eventBus.subscribe<JobWriteReadyEvent>(
          ReactorEventTypes.JOB_WRITE_READY,
          (_type, event) => {
            const meta = event.jobMeta as
              | { batchId?: string; batchJobIds?: string[] }
              | undefined;
            if (!meta?.batchId || !meta?.batchJobIds) {
              return;
            }

            seenJobIds.add(event.jobId);

            const allSeen = meta.batchJobIds.every((id) => seenJobIds.has(id));
            if (allSeen) {
              completedBatchId = meta.batchId;
              batchJobIds = meta.batchJobIds;
              unsubscribe();
              resolve();
            }
          },
        );
      });

      const doc = documentModelDocumentModelModule.utils.createDocument();
      doc.header.name = "Batch Test Document";
      await client.createDocumentInDrive(drive.header.id, doc);
      await batchCompletedPromise;

      expect(completedBatchId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(batchJobIds.length).toBe(2);

      const createdDoc = await client.get(doc.header.id);
      expect(createdDoc).toBeDefined();
      expect(createdDoc.header.name).toBe("Batch Test Document");

      const driveResult = await client.get(drive.header.id);
      const driveState = driveResult.state as any;
      const files = driveState.global.nodes || [];
      const addedFile = files.find((n: any) => n.id === doc.header.id);
      expect(addedFile).toBeDefined();
    });
  });
});
