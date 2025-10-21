import type {
  DocumentDriveDocument,
  FileNode,
  FolderNode,
} from "document-drive";
import { driveDocumentModelModule } from "document-drive";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import type { WriteCacheConfig } from "../../src/cache/types.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  IKeyframeStore,
  IOperationStore,
} from "../../src/storage/interfaces.js";
import type { Database as DatabaseSchema } from "../../src/storage/kysely/types.js";
import { createTestOperationStore } from "../factories.js";

describe("KyselyWriteCache - End-to-End Integration", () => {
  let cache: KyselyWriteCache;
  let registry: IDocumentModelRegistry;
  let operationStore: IOperationStore;
  let keyframeStore: IKeyframeStore;
  let db: Kysely<DatabaseSchema>;
  let config: WriteCacheConfig;

  beforeEach(async () => {
    const setup = await createTestOperationStore();
    db = setup.db;
    operationStore = setup.store;
    keyframeStore = setup.keyframeStore;

    registry = new DocumentModelRegistry();
    registry.registerModules(driveDocumentModelModule);

    config = {
      maxDocuments: 10,
      ringBufferSize: 5,
      keyframeInterval: 10,
    };

    cache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      config,
    );

    await cache.startup();
  });

  afterEach(async () => {
    await cache.shutdown();

    try {
      await db.destroy();
    } catch {
      //
    }
  });

  describe("Full cache flow: cold miss -> cache hit -> warm miss", () => {
    it("should handle complete document lifecycle with document-drive operations", async () => {
      const docId = "drive-doc-1";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        txn.addOperations({
          id: "op-1",
          index: 1,
          skip: 0,
          hash: "hash-1",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-1",
              name: "Documents",
              parentFolder: null,
            },
          },
        });

        txn.addOperations({
          id: "op-2",
          index: 2,
          skip: 0,
          hash: "hash-2",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-2",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "file-1",
              name: "readme.txt",
              documentType: "powerhouse/document-model",
              parentFolder: "folder-1",
            },
          },
        });

        txn.addOperations({
          id: "op-3",
          index: 3,
          skip: 0,
          hash: "hash-3",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-3",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-2",
              name: "Images",
              parentFolder: null,
            },
          },
        });
      });

      const doc3 = await cache.getState(docId, docType, scope, branch, 3);
      expect(doc3.header.documentType).toBe(docType);

      const driveDoc3 = doc3 as DocumentDriveDocument;
      const nodes3 = Object.values(driveDoc3.state.global.nodes);
      expect(nodes3).toHaveLength(3);

      const folder1 = nodes3.find(
        (n) => n.kind === "folder" && n.name === "Documents",
      ) as FolderNode;
      const folder2 = nodes3.find(
        (n) => n.kind === "folder" && n.name === "Images",
      ) as FolderNode;
      const file1 = nodes3.find(
        (n) => n.kind === "file" && n.name === "readme.txt",
      ) as FileNode;

      expect(folder1).toBeDefined();
      expect(folder1.id).toBe("folder-1");
      expect(folder1.parentFolder).toBeNull();

      expect(folder2).toBeDefined();
      expect(folder2.id).toBe("folder-2");
      expect(folder2.parentFolder).toBeNull();

      expect(file1).toBeDefined();
      expect(file1.id).toBe("file-1");
      expect(file1.parentFolder).toBe("folder-1");
      expect(file1.documentType).toBe("powerhouse/document-model");

      const stream3 = cache.getStream(docId, scope, branch);
      expect(stream3).toBeDefined();
      expect(stream3?.ringBuffer.length).toBe(1);

      const doc3Again = await cache.getState(docId, docType, scope, branch, 3);
      expect(doc3Again).toEqual(doc3);
      expect(doc3Again).not.toBe(doc3);

      await operationStore.apply(docId, docType, scope, branch, 4, (txn) => {
        txn.addOperations({
          id: "op-4",
          index: 4,
          skip: 0,
          hash: "hash-4",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-4",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "file-2",
              name: "image.png",
              documentType: "powerhouse/document-model",
              parentFolder: "folder-2",
            },
          },
        });

        txn.addOperations({
          id: "op-5",
          index: 5,
          skip: 0,
          hash: "hash-5",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-5",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "folder-3",
              name: "Archive",
              parentFolder: "folder-1",
            },
          },
        });
      });

      const doc5 = await cache.getState(docId, docType, scope, branch, 5);
      expect(doc5).toBeDefined();

      const driveDoc5 = doc5 as DocumentDriveDocument;
      const nodes5 = Object.values(driveDoc5.state.global.nodes);
      expect(nodes5).toHaveLength(5);

      const file2 = nodes5.find(
        (n) => n.kind === "file" && n.name === "image.png",
      ) as FileNode;
      const folder3 = nodes5.find(
        (n) => n.kind === "folder" && n.name === "Archive",
      ) as FolderNode;

      expect(file2).toBeDefined();
      expect(file2.id).toBe("file-2");
      expect(file2.parentFolder).toBe("folder-2");

      expect(folder3).toBeDefined();
      expect(folder3.id).toBe("folder-3");
      expect(folder3.parentFolder).toBe("folder-1");

      const stream5 = cache.getStream(docId, scope, branch);
      expect(stream5?.ringBuffer.length).toBe(2);
      const snapshots = stream5?.ringBuffer.getAll();
      expect(snapshots?.[0].revision).toBe(3);
      expect(snapshots?.[1].revision).toBe(5);
    });

    it("should handle cold miss with keyframe acceleration", async () => {
      const docId = "drive-doc-2";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        for (let i = 1; i <= 25; i++) {
          txn.addOperations({
            id: `op-${i}`,
            index: i,
            skip: 0,
            hash: `hash-${i}`,
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `action-${i}`,
              type: "ADD_FOLDER",
              scope: "global",
              timestampUtcMs: Date.now().toString(),
              input: {
                id: `folder-${i}`,
                name: `Folder ${i}`,
                parentFolder: null,
              },
            },
          });
        }
      });

      const doc10 = await cache.getState(docId, docType, scope, branch, 10);
      await keyframeStore.putKeyframe(docId, docType, scope, branch, 10, doc10);

      const doc20 = await cache.getState(docId, docType, scope, branch, 20);
      await keyframeStore.putKeyframe(docId, docType, scope, branch, 20, doc20);

      await db
        .deleteFrom("Operation")
        .where("documentId", "=", docId)
        .where("index", "<=", 20)
        .execute();

      cache.clear();

      const doc25 = await cache.getState(docId, docType, scope, branch, 25);
      expect(doc25).toBeDefined();

      const driveDoc25 = doc25 as DocumentDriveDocument;
      const nodes = Object.values(driveDoc25.state.global.nodes);
      expect(nodes).toHaveLength(25);

      const folder25 = nodes.find(
        (n) => n.kind === "folder" && n.name === "Folder 25",
      ) as FolderNode;
      expect(folder25).toBeDefined();
      expect(folder25.id).toBe("folder-25");
    });

    it("should properly cache keyframes at configured intervals", async () => {
      const docId = "drive-doc-3";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        for (let i = 1; i <= 30; i++) {
          txn.addOperations({
            id: `op-${i}`,
            index: i,
            skip: 0,
            hash: `hash-${i}`,
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `action-${i}`,
              type: "ADD_FILE",
              scope: "global",
              timestampUtcMs: Date.now().toString(),
              input: {
                id: `file-${i}`,
                name: `file-${i}.txt`,
                documentType: "powerhouse/document-model",
                parentFolder: null,
              },
            },
          });
        }
      });

      for (let i = 10; i <= 30; i += 10) {
        const doc = await cache.getState(docId, docType, scope, branch, i);
        cache.putState(docId, docType, scope, branch, i, doc);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      const keyframe10 = await keyframeStore.findNearestKeyframe(
        docId,
        scope,
        branch,
        10,
      );
      expect(keyframe10).toBeDefined();
      expect(keyframe10?.revision).toBe(10);

      const keyframe20 = await keyframeStore.findNearestKeyframe(
        docId,
        scope,
        branch,
        20,
      );
      expect(keyframe20).toBeDefined();
      expect(keyframe20?.revision).toBe(20);

      const keyframe30 = await keyframeStore.findNearestKeyframe(
        docId,
        scope,
        branch,
        30,
      );
      expect(keyframe30).toBeDefined();
      expect(keyframe30?.revision).toBe(30);

      const keyframe15 = await keyframeStore.findNearestKeyframe(
        docId,
        scope,
        branch,
        15,
      );
      expect(keyframe15).toBeDefined();
      expect(keyframe15?.revision).toBe(10);

      const keyframe25 = await keyframeStore.findNearestKeyframe(
        docId,
        scope,
        branch,
        25,
      );
      expect(keyframe25).toBeDefined();
      expect(keyframe25?.revision).toBe(20);
    });
  });

  describe("Realistic document-drive scenarios", () => {
    it("should handle complex folder hierarchy with multiple files", async () => {
      const docId = "drive-doc-4";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        txn.addOperations({
          id: "op-1",
          index: 1,
          skip: 0,
          hash: "hash-1",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-1",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "root",
              name: "Root",
              parentFolder: null,
            },
          },
        });

        txn.addOperations({
          id: "op-2",
          index: 2,
          skip: 0,
          hash: "hash-2",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-2",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "projects",
              name: "Projects",
              parentFolder: "root",
            },
          },
        });

        txn.addOperations({
          id: "op-3",
          index: 3,
          skip: 0,
          hash: "hash-3",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-3",
            type: "ADD_FOLDER",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "personal",
              name: "Personal",
              parentFolder: "root",
            },
          },
        });

        txn.addOperations({
          id: "op-4",
          index: 4,
          skip: 0,
          hash: "hash-4",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-4",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "project-1",
              name: "Project Alpha",
              documentType: "powerhouse/document-model",
              parentFolder: "projects",
            },
          },
        });

        txn.addOperations({
          id: "op-5",
          index: 5,
          skip: 0,
          hash: "hash-5",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-5",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "project-2",
              name: "Project Beta",
              documentType: "powerhouse/document-model",
              parentFolder: "projects",
            },
          },
        });

        txn.addOperations({
          id: "op-6",
          index: 6,
          skip: 0,
          hash: "hash-6",
          timestampUtcMs: new Date().toISOString(),
          action: {
            id: "action-6",
            type: "ADD_FILE",
            scope: "global",
            timestampUtcMs: Date.now().toString(),
            input: {
              id: "personal-1",
              name: "Notes",
              documentType: "powerhouse/document-model",
              parentFolder: "personal",
            },
          },
        });
      });

      const doc6 = await cache.getState(docId, docType, scope, branch, 6);
      expect(doc6).toBeDefined();

      const driveDoc6 = doc6 as DocumentDriveDocument;
      const nodes = Object.values(driveDoc6.state.global.nodes);
      expect(nodes).toHaveLength(6);

      const root = nodes.find(
        (n) => n.kind === "folder" && n.name === "Root",
      ) as FolderNode;
      const projects = nodes.find(
        (n) => n.kind === "folder" && n.name === "Projects",
      ) as FolderNode;
      const personal = nodes.find(
        (n) => n.kind === "folder" && n.name === "Personal",
      ) as FolderNode;
      const projectAlpha = nodes.find(
        (n) => n.kind === "file" && n.name === "Project Alpha",
      ) as FileNode;
      const projectBeta = nodes.find(
        (n) => n.kind === "file" && n.name === "Project Beta",
      ) as FileNode;
      const notes = nodes.find(
        (n) => n.kind === "file" && n.name === "Notes",
      ) as FileNode;

      expect(root.parentFolder).toBeNull();
      expect(projects.parentFolder).toBe("root");
      expect(personal.parentFolder).toBe("root");
      expect(projectAlpha.parentFolder).toBe("projects");
      expect(projectBeta.parentFolder).toBe("projects");
      expect(notes.parentFolder).toBe("personal");

      const doc2 = await cache.getState(docId, docType, scope, branch, 2);
      const driveDoc2 = doc2 as DocumentDriveDocument;
      const nodes2 = Object.values(driveDoc2.state.global.nodes);
      expect(nodes2).toHaveLength(2);
      expect(nodes2.some((n) => n.name === "Root")).toBe(true);
      expect(nodes2.some((n) => n.name === "Projects")).toBe(true);
    });

    it("should maintain cache consistency across multiple getState calls", async () => {
      const docId = "drive-doc-5";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        for (let i = 1; i <= 15; i++) {
          txn.addOperations({
            id: `op-${i}`,
            index: i,
            skip: 0,
            hash: `hash-${i}`,
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `action-${i}`,
              type: "ADD_FOLDER",
              scope: "global",
              timestampUtcMs: Date.now().toString(),
              input: {
                id: `folder-${i}`,
                name: `Folder ${i}`,
                parentFolder: null,
              },
            },
          });
        }
      });

      const doc5a = await cache.getState(docId, docType, scope, branch, 5);
      const doc5b = await cache.getState(docId, docType, scope, branch, 5);
      expect(doc5a).toEqual(doc5b);
      expect(doc5a).not.toBe(doc5b);

      const doc10a = await cache.getState(docId, docType, scope, branch, 10);
      const doc10b = await cache.getState(docId, docType, scope, branch, 10);
      expect(doc10a).toEqual(doc10b);
      expect(doc10a).not.toBe(doc10b);

      const doc15a = await cache.getState(docId, docType, scope, branch, 15);
      const doc15b = await cache.getState(docId, docType, scope, branch, 15);
      expect(doc15a).toEqual(doc15b);
      expect(doc15a).not.toBe(doc15b);

      const driveDoc5 = doc5a as DocumentDriveDocument;
      const driveDoc10 = doc10a as DocumentDriveDocument;
      const driveDoc15 = doc15a as DocumentDriveDocument;

      expect(Object.keys(driveDoc5.state.global.nodes)).toHaveLength(5);
      expect(Object.keys(driveDoc10.state.global.nodes)).toHaveLength(10);
      expect(Object.keys(driveDoc15.state.global.nodes)).toHaveLength(15);
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle abort signal during integration test", async () => {
      const docId = "drive-doc-7";
      const docType = "powerhouse/document-drive";
      const scope = "global";
      const branch = "main";

      const initialState = driveDocumentModelModule.utils.createState();

      await operationStore.apply(
        docId,
        docType,
        "document",
        branch,
        0,
        (txn) => {
          txn.addOperations({
            id: "op-doc-0",
            index: 0,
            skip: 0,
            hash: "hash-doc-0",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-create`,
              type: "CREATE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                version: "0.0.0",
              },
            },
          });

          txn.addOperations({
            id: "op-doc-1",
            index: 1,
            skip: 0,
            hash: "hash-doc-1",
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `${docId}-upgrade`,
              type: "UPGRADE_DOCUMENT",
              scope: "document",
              timestampUtcMs: Date.now().toString(),
              input: {
                documentId: docId,
                model: docType,
                fromVersion: "0.0.0",
                toVersion: "1.0.0",
                initialState,
              },
            },
          });
        },
      );

      await operationStore.apply(docId, docType, scope, branch, 0, (txn) => {
        for (let i = 1; i <= 50; i++) {
          txn.addOperations({
            id: `op-${i}`,
            index: i,
            skip: 0,
            hash: `hash-${i}`,
            timestampUtcMs: new Date().toISOString(),
            action: {
              id: `action-${i}`,
              type: "ADD_FOLDER",
              scope: "global",
              timestampUtcMs: Date.now().toString(),
              input: {
                id: `folder-${i}`,
                name: `Folder ${i}`,
                parentFolder: null,
              },
            },
          });
        }
      });

      const controller = new AbortController();
      controller.abort();

      await expect(
        cache.getState(docId, docType, scope, branch, 50, controller.signal),
      ).rejects.toThrow("Operation aborted");
    });
  });
});
