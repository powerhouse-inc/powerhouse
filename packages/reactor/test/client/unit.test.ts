import type {
  Action,
  AuthSubject,
  DocumentModelModule,
  ISigner,
  Operation,
  PHAuthState,
  PHDocument,
  PHDocumentState,
} from "@powerhousedao/shared/document-model";
import { MAX_SUPPORTED_AUTH_VERSION } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodeCompositeCursor } from "../../src/client/cursor.js";
import { ReactorClient } from "../../src/client/reactor-client.js";
import { resolveFeatureFlags } from "../../src/core/feature-flags.js";
import type { IReadGate } from "../../src/decision/read-gate.js";
import {
  BareReadGate,
  ModelReadGate,
  readDecisionModel,
} from "../../src/decision/read-gate.js";
import type { IReactorClient } from "../../src/client/types.js";
import type { BatchExecutionResult, IReactor } from "../../src/core/types.js";
import type { IJobAwaiter } from "../../src/shared/awaiter.js";
import {
  JobStatus,
  PropagationMode,
  type JobInfo,
  type PagedResults,
} from "../../src/shared/types.js";
import type {
  IDocumentIndexer,
  IDocumentView,
} from "../../src/storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../../src/subs/types.js";
import {
  createEmptyConsistencyToken,
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockJobAwaiter,
  createMockLogger,
  createMockSigner,
  createMockSubscriptionManager,
} from "../factories.js";

function mockOperation(index: number): Operation {
  return {
    id: `op-${index}`,
    index,
    skip: 0,
    timestampUtcMs: Date.now().toString(),
    hash: `hash-${index}`,
    action: { type: "TEST", input: {} },
  } as Operation;
}

function createMockPHDocument(id: string, documentType = "test"): PHDocument {
  return {
    header: {
      id,
      documentType,
      slug: "",
      name: "",
      branch: "main",
      meta: {},
      sig: {
        publicKey: "mock-pub-key",
        nonce: "mock-nonce",
      },
      createdAtUtcIso: new Date().toISOString(),
    },
    state: {
      document: { version: 1 },
    },
    initialState: {},
  } as unknown as PHDocument;
}

describe("ReactorClient Unit Tests", () => {
  let client: IReactorClient;
  let mockReactor: IReactor;
  let mockSigner: ISigner;
  let mockSubscriptionManager: IReactorSubscriptionManager;
  let mockJobAwaiter: IJobAwaiter;
  let mockDocumentIndexer: IDocumentIndexer;
  let mockDocumentView: IDocumentView;

  beforeEach(() => {
    mockDocumentIndexer = createMockDocumentIndexer();
    mockDocumentView = createMockDocumentView();

    mockReactor = {
      documentIndexer: mockDocumentIndexer,
      getDocumentModels: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "", limit: 10 },
      }),
      get: vi.fn(),
      getBySlug: vi.fn(),
      getByIdOrSlug: vi
        .fn()
        .mockResolvedValue(createMockPHDocument("mock-doc")),
      getOperations: vi.fn().mockResolvedValue({}),
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "", limit: 10 },
      }),
      execute: vi.fn(),
      executeBatch: vi.fn(),
      addRelationship: vi.fn(),
      removeRelationship: vi.fn(),
      deleteDocument: vi.fn(),
      getJobStatus: vi.fn(),
      create: vi.fn(),
    } as unknown as IReactor;

    mockSigner = createMockSigner();

    mockSubscriptionManager = createMockSubscriptionManager();

    mockJobAwaiter = createMockJobAwaiter();

    client = new ReactorClient(
      createMockLogger(),
      mockReactor,
      mockSigner,
      mockSubscriptionManager,
      mockJobAwaiter,
      mockDocumentIndexer,
      mockDocumentView,
    );
  });

  describe("getDocumentModels", () => {
    it("should pass through to reactor.getDocumentModels", async () => {
      const mockResult: PagedResults<DocumentModelModule> = {
        results: [
          { documentModel: { global: { id: "test" } } },
        ] as DocumentModelModule[],
        options: { cursor: "", limit: 10 },
      };

      vi.mocked(mockReactor.getDocumentModels).mockResolvedValue(mockResult);

      const result = await client.getDocumentModelModules();

      expect(mockReactor.getDocumentModels).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    it("should pass namespace, paging, and signal to reactor", async () => {
      const namespace = "powerhouse";
      const paging = { cursor: "10", limit: 20 };
      const signal = new AbortController().signal;

      await client.getDocumentModelModules(namespace, paging, signal);

      expect(mockReactor.getDocumentModels).toHaveBeenCalledWith(
        namespace,
        paging,
        signal,
      );
    });
  });

  describe("get", () => {
    it("should call getByIdOrSlug with identifier", async () => {
      const mockDoc: PHDocument = {
        header: {
          id: "doc-1",
          documentType: "test",
        },
      } as PHDocument;

      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(mockDoc);

      const result = await client.get("doc-1");

      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        "doc-1",
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockDoc);
    });

    it("should resolve both IDs and slugs", async () => {
      const mockDoc: PHDocument = {
        header: {
          id: "doc-1",
          documentType: "test",
          slug: "my-doc",
        },
      } as PHDocument;

      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(mockDoc);

      const result = await client.get("my-doc");

      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        "my-doc",
        undefined,
        undefined,
        undefined,
      );
      expect(result.header.slug).toBe("my-doc");
    });

    it("should pass view and signal parameters", async () => {
      const view = { branch: "main" };
      const signal = new AbortController().signal;

      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({} as PHDocument);

      await client.get("doc-1", view, signal);

      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        "doc-1",
        view,
        undefined,
        signal,
      );
    });
  });

  describe("find", () => {
    it("should pass through to reactor.find", async () => {
      const search = { type: "test-doc" };
      const mockResult: PagedResults<PHDocument> = {
        results: [],
        options: { cursor: "", limit: 10 },
      };

      vi.mocked(mockReactor.find).mockResolvedValue(mockResult);

      const result = await client.find(search);

      expect(mockReactor.find).toHaveBeenCalledWith(
        search,
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockResult);
    });

    it("should pass all parameters to reactor.find", async () => {
      const search = { ids: ["doc-1", "doc-2"] };
      const view = { branch: "main" };
      const paging = { cursor: "5", limit: 5 };
      const signal = new AbortController().signal;

      await client.find(search, view, paging, signal);

      expect(mockReactor.find).toHaveBeenCalledWith(
        search,
        view,
        paging,
        undefined,
        signal,
      );
    });
  });

  describe("getOperations", () => {
    it("should use documentView.resolveIdOrSlug to resolve the identifier", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue(
        "resolved-doc-id",
      );
      vi.mocked(mockReactor.getOperations).mockResolvedValue({});

      await client.getOperations("my-slug");

      expect(mockDocumentView.resolveIdOrSlug).toHaveBeenCalledWith(
        "my-slug",
        undefined,
        undefined,
        undefined,
      );
      expect(mockReactor.getOperations).toHaveBeenCalledWith(
        "resolved-doc-id",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it("should pass view and signal to resolveIdOrSlug", async () => {
      const view = { branch: "feature" };
      const signal = new AbortController().signal;

      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("doc-1");
      vi.mocked(mockReactor.getOperations).mockResolvedValue({});

      await client.getOperations("doc-1", view, undefined, undefined, signal);

      expect(mockDocumentView.resolveIdOrSlug).toHaveBeenCalledWith(
        "doc-1",
        view,
        undefined,
        signal,
      );
    });

    it("should return composite cursor when multiple scopes have more data", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("doc-1");
      vi.mocked(mockReactor.getOperations).mockResolvedValue({
        document: {
          results: [mockOperation(0), mockOperation(1)],
          options: { cursor: "0", limit: 2 },
          nextCursor: "1",
        },
        global: {
          results: [mockOperation(0), mockOperation(1)],
          options: { cursor: "0", limit: 2 },
          nextCursor: "1",
        },
      });

      const result = await client.getOperations("doc-1", undefined, undefined, {
        cursor: "",
        limit: 2,
      });

      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor).toMatch(/^c:/);
      expect(result.nextCursor).toContain('"document"');
      expect(result.nextCursor).toContain('"global"');
    });

    it("should omit exhausted scopes from composite cursor", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("doc-1");
      vi.mocked(mockReactor.getOperations).mockResolvedValue({
        document: {
          results: [mockOperation(0), mockOperation(1)],
          options: { cursor: "0", limit: 2 },
          nextCursor: undefined,
        },
        global: {
          results: [mockOperation(0), mockOperation(1)],
          options: { cursor: "0", limit: 2 },
          nextCursor: "1",
        },
      });

      const result = await client.getOperations("doc-1", undefined, undefined, {
        cursor: "",
        limit: 2,
      });

      expect(result.nextCursor).toBeDefined();
      expect(result.nextCursor).toMatch(/^c:/);
      expect(result.nextCursor).not.toContain('"document"');
      expect(result.nextCursor).toContain('"global"');
    });

    it("should return undefined nextCursor when all scopes exhausted in multi-scope", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("doc-1");
      vi.mocked(mockReactor.getOperations).mockResolvedValue({
        document: {
          results: [mockOperation(0)],
          options: { cursor: "0", limit: 2 },
          nextCursor: undefined,
        },
        global: {
          results: [mockOperation(0)],
          options: { cursor: "0", limit: 2 },
          nextCursor: undefined,
        },
      });

      const result = await client.getOperations("doc-1", undefined, undefined, {
        cursor: "",
        limit: 2,
      });

      expect(result.nextCursor).toBeUndefined();
    });

    it("should decode composite cursor and query each scope independently", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("doc-1");
      vi.mocked(mockReactor.getOperations).mockResolvedValue({
        global: {
          results: [mockOperation(2)],
          options: { cursor: "1", limit: 2 },
          nextCursor: undefined,
        },
      });

      const compositeCursor = encodeCompositeCursor({ global: "1" });
      await client.getOperations("doc-1", undefined, undefined, {
        cursor: compositeCursor,
        limit: 2,
      });

      expect(mockReactor.getOperations).toHaveBeenCalledWith(
        "doc-1",
        { scopes: ["global"] },
        undefined,
        { cursor: "1", limit: 2 },
        undefined,
        undefined,
      );
    });

    it("should preserve view.branch when using composite cursor", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("doc-1");
      vi.mocked(mockReactor.getOperations).mockResolvedValue({
        global: {
          results: [mockOperation(2)],
          options: { cursor: "1", limit: 2 },
          nextCursor: undefined,
        },
      });

      const compositeCursor = encodeCompositeCursor({ global: "1" });
      await client.getOperations("doc-1", { branch: "draft" }, undefined, {
        cursor: compositeCursor,
        limit: 2,
      });

      expect(mockReactor.getOperations).toHaveBeenCalledWith(
        "doc-1",
        { branch: "draft", scopes: ["global"] },
        undefined,
        { cursor: "1", limit: 2 },
        undefined,
        undefined,
      );
    });
  });

  describe("getOutgoingRelationships", () => {
    it("should use documentView.resolveIdOrSlug to resolve the source identifier", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue(
        "resolved-parent-id",
      );
      vi.mocked(mockDocumentIndexer.getOutgoing).mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      });

      await client.getOutgoingRelationships("parent-slug", "child");

      expect(mockDocumentView.resolveIdOrSlug).toHaveBeenCalledWith(
        "parent-slug",
        undefined,
        undefined,
        undefined,
      );
      expect(mockDocumentIndexer.getOutgoing).toHaveBeenCalledWith(
        "resolved-parent-id",
        ["child"],
        undefined,
        undefined,
        undefined,
      );
    });

    it("should pass view and signal to resolveIdOrSlug", async () => {
      const view = { branch: "feature" };
      const signal = new AbortController().signal;

      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("parent-1");
      vi.mocked(mockDocumentIndexer.getOutgoing).mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      });

      await client.getOutgoingRelationships(
        "parent-1",
        "child",
        view,
        undefined,
        signal,
      );

      expect(mockDocumentView.resolveIdOrSlug).toHaveBeenCalledWith(
        "parent-1",
        view,
        undefined,
        signal,
      );
    });

    it("should return empty results when no children exist", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("parent-1");
      vi.mocked(mockDocumentIndexer.getOutgoing).mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      });

      const result = await client.getOutgoingRelationships("parent-1", "child");

      expect(result.results).toEqual([]);
      expect(mockReactor.find).not.toHaveBeenCalled();
    });

    it("should return child documents when children exist", async () => {
      const childDocs = [
        { header: { id: "child-1" } },
        { header: { id: "child-2" } },
      ] as PHDocument[];

      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("parent-1");
      vi.mocked(mockDocumentIndexer.getOutgoing).mockResolvedValue({
        results: [
          {
            sourceId: "parent-1",
            targetId: "child-1",
            relationshipType: "child",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            sourceId: "parent-1",
            targetId: "child-2",
            relationshipType: "child",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        options: { cursor: "0", limit: 100 },
      });
      vi.mocked(mockReactor.find).mockResolvedValue({
        results: childDocs,
        options: { cursor: "", limit: 10 },
      });

      const result = await client.getOutgoingRelationships("parent-1", "child");

      expect(mockReactor.find).toHaveBeenCalledWith(
        { ids: ["child-1", "child-2"] },
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(result.results).toEqual(childDocs);
    });
  });

  describe("getIncomingRelationships", () => {
    it("should use documentView.resolveIdOrSlug to resolve the target identifier", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue(
        "resolved-child-id",
      );
      vi.mocked(mockDocumentIndexer.getIncoming).mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      });

      await client.getIncomingRelationships("child-slug", "child");

      expect(mockDocumentView.resolveIdOrSlug).toHaveBeenCalledWith(
        "child-slug",
        undefined,
        undefined,
        undefined,
      );
      expect(mockDocumentIndexer.getIncoming).toHaveBeenCalledWith(
        "resolved-child-id",
        ["child"],
        undefined,
        undefined,
        undefined,
      );
    });

    it("should pass view and signal to resolveIdOrSlug", async () => {
      const view = { branch: "feature" };
      const signal = new AbortController().signal;

      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("child-1");
      vi.mocked(mockDocumentIndexer.getIncoming).mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      });

      await client.getIncomingRelationships(
        "child-1",
        "child",
        view,
        undefined,
        signal,
      );

      expect(mockDocumentView.resolveIdOrSlug).toHaveBeenCalledWith(
        "child-1",
        view,
        undefined,
        signal,
      );
    });

    it("should return empty results when no parents exist", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("child-1");
      vi.mocked(mockDocumentIndexer.getIncoming).mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      });

      const result = await client.getIncomingRelationships("child-1", "child");

      expect(result.results).toEqual([]);
      expect(mockReactor.find).not.toHaveBeenCalled();
    });

    it("should return parent documents when parents exist", async () => {
      const parentDocs = [{ header: { id: "parent-1" } }] as PHDocument[];

      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("child-1");
      vi.mocked(mockDocumentIndexer.getIncoming).mockResolvedValue({
        results: [
          {
            sourceId: "parent-1",
            targetId: "child-1",
            relationshipType: "child",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        options: { cursor: "0", limit: 100 },
      });
      vi.mocked(mockReactor.find).mockResolvedValue({
        results: parentDocs,
        options: { cursor: "", limit: 10 },
      });

      const result = await client.getIncomingRelationships("child-1", "child");

      expect(mockReactor.find).toHaveBeenCalledWith(
        { ids: ["parent-1"] },
        undefined,
        undefined,
        undefined,
        undefined,
      );
      expect(result.results).toEqual(parentDocs);
    });
  });

  describe("create", () => {
    it("should call executeBatch, wait for job, and return document", async () => {
      const document = createMockPHDocument("doc-1");

      const completedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const batchResult: BatchExecutionResult = {
        jobs: {
          create: {
            id: "job-1",
            documentId: "test-doc",
            status: JobStatus.PENDING,
            createdAtUtcIso: new Date().toISOString(),
            consistencyToken: createEmptyConsistencyToken(),
            meta: { batchId: "test", batchJobIds: ["job-1"] },
          },
        },
      };

      vi.mocked(mockReactor.executeBatch).mockResolvedValue(batchResult);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.get).mockResolvedValue(document);

      const result = await client.create(document);

      expect(mockReactor.executeBatch).toHaveBeenCalledWith(
        {
          jobs: [
            expect.objectContaining({
              key: "create",
              documentId: "doc-1",
              branch: "main",
              dependsOn: [],
            }),
          ],
        },
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.get).toHaveBeenCalledWith("doc-1");
      expect(result).toEqual(document);
    });

    it("should pass signal to executeBatch", async () => {
      const document = createMockPHDocument("doc-1");
      const signal = new AbortController().signal;

      const completedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const batchResult: BatchExecutionResult = {
        jobs: {
          create: {
            id: "job-1",
            documentId: "test-doc",
            status: JobStatus.PENDING,
            createdAtUtcIso: new Date().toISOString(),
            consistencyToken: createEmptyConsistencyToken(),
            meta: { batchId: "test", batchJobIds: ["job-1"] },
          },
        },
      };

      vi.mocked(mockReactor.executeBatch).mockResolvedValue(batchResult);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.get).mockResolvedValue(document);

      await client.create(document, undefined, signal);

      expect(mockReactor.executeBatch).toHaveBeenCalledWith(
        expect.any(Object),
        signal,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
    });

    it("should include parent job in executeBatch when parentIdentifier is provided", async () => {
      const document = createMockPHDocument("doc-1");

      const completedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const batchResult: BatchExecutionResult = {
        jobs: {
          create: {
            id: "job-1",
            documentId: "test-doc",
            status: JobStatus.PENDING,
            createdAtUtcIso: new Date().toISOString(),
            consistencyToken: createEmptyConsistencyToken(),
            meta: { batchId: "test", batchJobIds: ["job-1"] },
          },
          parent: {
            id: "job-2",
            documentId: "test-doc",
            status: JobStatus.PENDING,
            createdAtUtcIso: new Date().toISOString(),
            consistencyToken: createEmptyConsistencyToken(),
            meta: { batchId: "test", batchJobIds: ["job-2"] },
          },
        },
      };

      vi.mocked(mockReactor.executeBatch).mockResolvedValue(batchResult);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.get).mockResolvedValue(document);

      const result = await client.create(document, "parent-1");

      expect(mockReactor.executeBatch).toHaveBeenCalledWith(
        {
          jobs: [
            expect.objectContaining({
              key: "create",
              documentId: "doc-1",
              branch: "main",
              dependsOn: [],
            }),
            expect.objectContaining({
              key: "parent",
              documentId: "parent-1",
              branch: "main",
              dependsOn: ["create"],
            }),
          ],
        },
        undefined,
      );
      expect(result).toEqual(document);
    });
  });

  describe("execute", () => {
    it("should sign actions and call reactor.execute, wait for job, and return document", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [
        {
          id: "action-1",
          type: "TEST_ACTION",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        },
      ];

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const completedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const mockDoc: PHDocument = {
        header: {
          id: documentId,
          documentType: "test",
        },
      } as PHDocument;

      vi.mocked(mockReactor.execute).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(mockDoc);

      const result = await client.execute(documentId, "main", actions);

      expect(mockSigner.signAction).toHaveBeenCalledWith(actions[0], undefined);
      expect(mockReactor.execute).toHaveBeenCalledWith(
        documentId,
        "main",
        expect.arrayContaining([
          expect.objectContaining({
            id: "action-1",
            type: "TEST_ACTION",
            context: expect.objectContaining({
              signer: expect.objectContaining({
                user: expect.any(Object),
                app: expect.any(Object),
                signatures: [
                  [
                    "mock-signature",
                    "mock-public-key",
                    "mock-hash",
                    "mock-prev-state-hash",
                    "mock-signature-hex",
                  ],
                ],
              }),
            }),
          }),
        ]),
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        documentId,
        { branch: "main" },
        completedJobInfo.consistencyToken,
        undefined,
      );
      expect(result).toEqual(mockDoc);
    });

    it("should pass signal to signer", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [
        {
          id: "action-1",
          type: "TEST_ACTION",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        },
      ];
      const signal = new AbortController().signal;

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockReactor.execute).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({} as PHDocument);

      await client.execute(documentId, "main", actions, signal);

      expect(mockSigner.signAction).toHaveBeenCalledWith(actions[0], signal);
    });

    it("should sign multiple actions", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [
        {
          id: "action-1",
          type: "TEST_ACTION_1",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        },
        {
          id: "action-2",
          type: "TEST_ACTION_2",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        },
      ];

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockReactor.execute).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({} as PHDocument);

      await client.execute(documentId, "main", actions);

      expect(mockSigner.signAction).toHaveBeenCalledTimes(2);
      expect(mockSigner.signAction).toHaveBeenCalledWith(actions[0], undefined);
      expect(mockSigner.signAction).toHaveBeenCalledWith(actions[1], undefined);
    });

    it("should pass view and signal parameters", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [];
      const branch = "feature";
      const signal = new AbortController().signal;

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockReactor.execute).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({} as PHDocument);

      await client.execute(documentId, branch, actions, signal);

      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        documentId,
        { branch },
        expect.any(Object),
        signal,
      );
    });
  });

  describe("executeAsync", () => {
    it("should sign actions and call reactor.execute", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [
        {
          id: "action-1",
          type: "TEST_ACTION",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        },
      ];

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockReactor.execute).mockResolvedValue(jobInfo);

      const result = await client.executeAsync(documentId, "main", actions);

      expect(mockSigner.signAction).toHaveBeenCalledWith(actions[0], undefined);
      expect(mockReactor.execute).toHaveBeenCalledWith(
        documentId,
        "main",
        expect.arrayContaining([
          expect.objectContaining({
            id: "action-1",
            type: "TEST_ACTION",
            context: expect.objectContaining({
              signer: expect.objectContaining({
                user: expect.any(Object),
                app: expect.any(Object),
                signatures: [
                  [
                    "mock-signature",
                    "mock-public-key",
                    "mock-hash",
                    "mock-prev-state-hash",
                    "mock-signature-hex",
                  ],
                ],
              }),
            }),
          }),
        ]),
        undefined,
      );
      expect(result).toEqual(jobInfo);
    });

    it("should pass signal to signer", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [
        {
          id: "action-1",
          type: "TEST_ACTION",
          scope: "global",
          timestampUtcMs: new Date().toISOString(),
          input: {},
        },
      ];
      const signal = new AbortController().signal;

      vi.mocked(mockReactor.execute).mockResolvedValue({
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      });

      await client.executeAsync(documentId, "main", actions, signal);

      expect(mockSigner.signAction).toHaveBeenCalledWith(actions[0], signal);
    });
  });

  describe("addRelationship", () => {
    it("should pass signer to reactor.addRelationship, wait for job, and return source document", async () => {
      const sourceId = "parent-1";
      const targetId = "child-1";

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const completedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const mockDoc: PHDocument = {
        header: {
          id: sourceId,
          documentType: "test",
        },
      } as PHDocument;

      vi.mocked(mockReactor.addRelationship).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(mockDoc);

      const result = await client.addRelationship(sourceId, targetId, "child");

      expect(mockReactor.addRelationship).toHaveBeenCalledWith(
        sourceId,
        targetId,
        "child",
        "main",
        mockSigner,
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        sourceId,
        { branch: "main" },
        completedJobInfo.consistencyToken,
        undefined,
      );
      expect(result).toEqual(mockDoc);
    });
  });

  describe("removeRelationship", () => {
    it("should pass signer to reactor.removeRelationship, wait for job, and return source document", async () => {
      const sourceId = "parent-1";
      const targetId = "child-1";

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const completedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const mockDoc: PHDocument = {
        header: {
          id: sourceId,
          documentType: "test",
        },
      } as PHDocument;

      vi.mocked(mockReactor.removeRelationship).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(mockDoc);

      const result = await client.removeRelationship(
        sourceId,
        targetId,
        "child",
      );

      expect(mockReactor.removeRelationship).toHaveBeenCalledWith(
        sourceId,
        targetId,
        "child",
        "main",
        mockSigner,
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        sourceId,
        { branch: "main" },
        completedJobInfo.consistencyToken,
        undefined,
      );
      expect(result).toEqual(mockDoc);
    });
  });

  describe("deleteDocument", () => {
    it("should pass signer to reactor.deleteDocument and wait for job", async () => {
      const documentId = "doc-1";

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(jobInfo);

      await client.deleteDocument(documentId);

      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(
        documentId,
        mockSigner,
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
    });

    it("should pass signer and signal parameters", async () => {
      const documentId = "doc-1";
      const signal = new AbortController().signal;

      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(jobInfo);

      await client.deleteDocument(documentId, PropagationMode.None, signal);

      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(
        documentId,
        mockSigner,
        signal,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
    });

    it("should pass signer and cascade delete children when propagate is Cascade", async () => {
      const parentId = "parent-1";
      const childId = "child-1";
      const signal = new AbortController().signal;

      const parentJobInfo: JobInfo = {
        id: "job-parent",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-parent"] },
      };

      const childJobInfo: JobInfo = {
        id: "job-child",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-child"] },
      };

      vi.mocked(mockDocumentIndexer.getOrphanedChildren).mockResolvedValue([
        childId,
      ]);

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(childJobInfo);
      vi.mocked(mockReactor.deleteDocument).mockResolvedValueOnce(childJobInfo);
      vi.mocked(mockReactor.deleteDocument).mockResolvedValueOnce(
        parentJobInfo,
      );

      await client.deleteDocument(parentId, PropagationMode.Cascade, signal);

      expect(mockDocumentIndexer.getOrphanedChildren).toHaveBeenCalledWith(
        [parentId],
        ["child"],
        signal,
      );
      expect(mockReactor.deleteDocument).toHaveBeenCalledTimes(2);
      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(
        childId,
        mockSigner,
        signal,
      );
      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(
        parentId,
        mockSigner,
        signal,
      );
    });
  });

  describe("getJobStatus", () => {
    it("should pass through to reactor.getJobStatus", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockReactor.getJobStatus).mockResolvedValue(jobInfo);

      const result = await client.getJobStatus("job-1");

      expect(mockReactor.getJobStatus).toHaveBeenCalledWith("job-1", undefined);
      expect(result).toEqual(jobInfo);
    });

    it("should pass signal parameter", async () => {
      const signal = new AbortController().signal;

      vi.mocked(mockReactor.getJobStatus).mockResolvedValue({
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      });

      await client.getJobStatus("job-1", signal);

      expect(mockReactor.getJobStatus).toHaveBeenCalledWith("job-1", signal);
    });
  });

  describe("waitForJob", () => {
    it("should call jobAwaiter.waitForJob with job ID string", async () => {
      const completedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);

      const result = await client.waitForJob("job-1");

      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(result).toEqual(completedJobInfo);
    });

    it("should extract ID from JobInfo object", async () => {
      const jobInfo: JobInfo = {
        id: "job-2",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-2"] },
      };

      const completedJobInfo: JobInfo = {
        ...jobInfo,
        status: JobStatus.READ_READY,
      };

      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);

      const result = await client.waitForJob(jobInfo);

      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-2",
        undefined,
      );
      expect(result).toEqual(completedJobInfo);
    });

    it("should pass signal parameter", async () => {
      const signal = new AbortController().signal;

      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue({
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      });

      await client.waitForJob("job-1", signal);

      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
    });
  });

  describe("Error Handling", () => {
    it("should propagate errors from reactor.getByIdOrSlug", async () => {
      const error = new Error("Get failed");
      vi.mocked(mockReactor.getByIdOrSlug).mockRejectedValue(error);

      await expect(client.get("doc-1")).rejects.toThrow("Get failed");
    });

    it("should propagate errors from jobAwaiter.waitForJob", async () => {
      const error = new Error("Job wait failed");

      vi.mocked(mockReactor.execute).mockResolvedValue({
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      });
      vi.mocked(mockJobAwaiter.waitForJob).mockRejectedValue(error);

      await expect(client.execute("doc-1", "main", [])).rejects.toThrow(
        "Job wait failed",
      );
    });

    it("should propagate errors from signer.signAction", async () => {
      const error = new Error("Signing failed");
      vi.mocked(mockSigner.signAction).mockRejectedValue(error);

      await expect(
        client.executeAsync("doc-1", "main", [
          {
            id: "action-1",
            type: "TEST",
            scope: "global",
            timestampUtcMs: new Date().toISOString(),
            input: {},
          },
        ]),
      ).rejects.toThrow("Signing failed");
    });
  });

  describe("Job Failure Handling", () => {
    it("should throw error when create job fails", async () => {
      const document = createMockPHDocument("doc-1");

      const failedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
        error: { name: "Error", message: "Create document failed", stack: "" },
      };

      const batchResult: BatchExecutionResult = {
        jobs: {
          create: {
            id: "job-1",
            documentId: "test-doc",
            status: JobStatus.PENDING,
            createdAtUtcIso: new Date().toISOString(),
            consistencyToken: createEmptyConsistencyToken(),
            meta: { batchId: "test", batchJobIds: ["job-1"] },
          },
        },
      };

      vi.mocked(mockReactor.executeBatch).mockResolvedValue(batchResult);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(failedJobInfo);

      await expect(client.create(document)).rejects.toThrow(
        "Create document failed",
      );
      expect(mockReactor.get).not.toHaveBeenCalled();
    });

    it("should throw error when execute job fails", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const failedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
        error: { name: "Error", message: "Execute action failed", stack: "" },
      };

      vi.mocked(mockReactor.execute).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(failedJobInfo);

      await expect(client.execute("doc-1", "main", [])).rejects.toThrow(
        "Execute action failed",
      );
      expect(mockReactor.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it("should throw error when addRelationship job fails", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const failedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
        error: { name: "Error", message: "Add relationship failed", stack: "" },
      };

      vi.mocked(mockReactor.addRelationship).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(failedJobInfo);

      await expect(
        client.addRelationship("parent-1", "child-1", "child"),
      ).rejects.toThrow("Add relationship failed");
      expect(mockReactor.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it("should throw error when removeRelationship job fails", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const failedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
        error: {
          name: "Error",
          message: "Remove relationship failed",
          stack: "",
        },
      };

      vi.mocked(mockReactor.removeRelationship).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(failedJobInfo);

      await expect(
        client.removeRelationship("parent-1", "child-1", "child"),
      ).rejects.toThrow("Remove relationship failed");
      expect(mockReactor.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it("should throw error when moveRelationship remove job fails", async () => {
      const removeJobInfo: JobInfo = {
        id: "job-remove",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-remove"] },
      };

      const failedRemoveJobInfo: JobInfo = {
        id: "job-remove",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-remove"] },
        error: {
          name: "Error",
          message: "Remove from source failed",
          stack: "",
        },
      };

      vi.mocked(mockReactor.removeRelationship).mockResolvedValue(
        removeJobInfo,
      );
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(
        failedRemoveJobInfo,
      );

      await expect(
        client.moveRelationship("source-1", "target-1", "child-1", "child"),
      ).rejects.toThrow("Remove from source failed");
      expect(mockReactor.addRelationship).not.toHaveBeenCalled();
    });

    it("should throw error when moveRelationship add job fails", async () => {
      const removeJobInfo: JobInfo = {
        id: "job-remove",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-remove"] },
      };

      const completedRemoveJobInfo: JobInfo = {
        id: "job-remove",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-remove"] },
      };

      const addJobInfo: JobInfo = {
        id: "job-add",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-add"] },
      };

      const failedAddJobInfo: JobInfo = {
        id: "job-add",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-add"] },
        error: { name: "Error", message: "Add to target failed", stack: "" },
      };

      vi.mocked(mockReactor.removeRelationship).mockResolvedValue(
        removeJobInfo,
      );
      vi.mocked(mockReactor.addRelationship).mockResolvedValue(addJobInfo);
      vi.mocked(mockJobAwaiter.waitForJob)
        .mockResolvedValueOnce(completedRemoveJobInfo)
        .mockResolvedValueOnce(failedAddJobInfo);

      await expect(
        client.moveRelationship("source-1", "target-1", "child-1", "child"),
      ).rejects.toThrow("Add to target failed");
      expect(mockReactor.getByIdOrSlug).not.toHaveBeenCalled();
    });

    it("should throw error when deleteDocument job fails", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
      };

      const failedJobInfo: JobInfo = {
        id: "job-1",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-1"] },
        error: { name: "Error", message: "Delete document failed", stack: "" },
      };

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(failedJobInfo);

      await expect(client.deleteDocument("doc-1")).rejects.toThrow(
        "Delete document failed",
      );
    });

    it("should throw error when any cascade delete job fails", async () => {
      const parentId = "parent-1";
      const childId = "child-1";

      const childJobInfo: JobInfo = {
        id: "job-child",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-child"] },
      };

      const parentJobInfo: JobInfo = {
        id: "job-parent",
        documentId: "test-doc",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-parent"] },
      };

      const failedChildJobInfo: JobInfo = {
        id: "job-child",
        documentId: "test-doc",
        status: JobStatus.FAILED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-child"] },
        error: { name: "Error", message: "Delete child failed", stack: "" },
      };

      const completedParentJobInfo: JobInfo = {
        id: "job-parent",
        documentId: "test-doc",
        status: JobStatus.READ_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
        meta: { batchId: "test", batchJobIds: ["job-parent"] },
      };

      vi.mocked(mockDocumentIndexer.getOutgoing).mockResolvedValue({
        results: [
          {
            sourceId: parentId,
            targetId: childId,
            relationshipType: "child",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        options: { cursor: "0", limit: 100 },
      });

      vi.mocked(mockReactor.deleteDocument)
        .mockResolvedValueOnce(childJobInfo)
        .mockResolvedValueOnce(parentJobInfo);

      vi.mocked(mockJobAwaiter.waitForJob)
        .mockResolvedValueOnce(failedChildJobInfo)
        .mockResolvedValueOnce(completedParentJobInfo);

      await expect(
        client.deleteDocument(parentId, PropagationMode.Cascade),
      ).rejects.toThrow("Delete child failed");
    });
  });

  describe("read gating", () => {
    const readGlobalPolicy = {
      version: 1,
      grants: [
        {
          id: "g-read-global",
          description: "reader reads global",
          effect: "allow",
          principal: { address: "0xreader" },
          capability: { can: "read", scope: "global" },
        },
      ],
    };

    function docWithScopes(
      id: string,
      auth: unknown,
      scopes: Record<string, unknown>,
    ): PHDocument {
      return {
        header: {
          id,
          documentType: "test",
          slug: "",
          name: "",
          branch: "main",
          meta: {},
          sig: { publicKey: "k", nonce: "" },
          createdAtUtcIso: new Date().toISOString(),
          revision: {},
        },
        state: { auth, document: { version: 1 }, ...scopes },
        initialState: {},
        operations: {},
        clipboard: [],
      } as unknown as PHDocument;
    }

    it("drops domain scopes the subject may not read, keeping metadata", async () => {
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
        docWithScopes("d1", readGlobalPolicy, {
          global: { x: 1 },
          local: { y: 2 },
        }),
      );

      const doc = await client.get("d1", {
        subject: { address: "0xreader" },
      });

      expect(Object.keys(doc.state).sort()).toEqual([
        "auth",
        "document",
        "global",
      ]);
      expect((doc.state as any).global).toEqual({ x: 1 });
    });

    it("denies every domain scope for a non-matching subject (auth stays visible)", async () => {
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
        docWithScopes("d1", readGlobalPolicy, {
          global: { x: 1 },
          local: { y: 2 },
        }),
      );

      const doc = await client.get("d1", {
        subject: { address: "0xstranger" },
      });

      expect(Object.keys(doc.state).sort()).toEqual(["auth", "document"]);
    });

    it("returns all scopes when the policy is uninitialized", async () => {
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
        docWithScopes(
          "d1",
          { version: 0, grants: [] },
          { global: { x: 1 }, local: { y: 2 } },
        ),
      );

      const doc = await client.get("d1", {
        subject: { address: "0xstranger" },
      });

      expect(Object.keys(doc.state).sort()).toEqual([
        "auth",
        "document",
        "global",
        "local",
      ]);
    });

    it("adds the auth scope to a scoped read so the policy is still evaluated", async () => {
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
        docWithScopes("d1", readGlobalPolicy, { global: { x: 1 } }),
      );

      await client.get("d1", {
        scopes: ["global"],
        subject: { address: "0xreader" },
      });

      const viewArg = vi.mocked(mockReactor.getByIdOrSlug).mock.calls[0][1];
      expect(viewArg?.scopes).toContain("auth");
      expect(viewArg?.scopes).toContain("global");
    });

    it("filters initialState, not just state", async () => {
      // initialState carries the same scopes, so filtering one and spreading
      // the other hands back the contents just removed.
      const doc = docWithScopes("d1", readGlobalPolicy, {
        global: { x: 1 },
        local: { y: 2 },
      });
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        ...doc,
        initialState: { ...doc.state },
      } as unknown as PHDocument);

      const filtered = await client.get("d1", {
        subject: { address: "0xreader" },
      });

      expect(Object.keys(filtered.initialState).sort()).toEqual([
        "auth",
        "document",
        "global",
      ]);
      expect((filtered.initialState as any).local).toBeUndefined();
    });

    it("keeps the auth scope in a scope-narrowed subscription fetch", async () => {
      // Without it the fetch omits the policy, decide() reads an absent policy
      // as uninitialized, and the gate allows everything.
      let onCreated: ((result: { results: string[] }) => void) | undefined;
      vi.mocked(mockSubscriptionManager.onDocumentCreated).mockImplementation(
        (handler: any) => {
          onCreated = handler;
          return () => {};
        },
      );
      vi.mocked(mockReactor.get).mockResolvedValue(
        docWithScopes("d1", readGlobalPolicy, { global: { x: 1 } }),
      );

      client.subscribe({} as any, () => {}, {
        scopes: ["global"],
        subject: { address: "0xreader" },
      });

      onCreated?.({ results: ["d1"] });

      await vi.waitFor(() => {
        expect(mockReactor.get).toHaveBeenCalled();
      });
      const viewArg = vi.mocked(mockReactor.get).mock.calls[0][1];
      expect(viewArg?.scopes).toContain("auth");
      expect(viewArg?.scopes).toContain("global");
    });

    it("falls back to the client's own signer when no subject is given", async () => {
      const signerClient = new ReactorClient(
        createMockLogger(),
        mockReactor,
        createMockSigner({
          user: { address: "0xreader", networkId: "", chainId: 0 },
          app: { name: "connect", key: "did:key:zReader" },
        }),
        mockSubscriptionManager,
        mockJobAwaiter,
        mockDocumentIndexer,
        mockDocumentView,
      );
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
        docWithScopes("d1", readGlobalPolicy, {
          global: { x: 1 },
          local: { y: 2 },
        }),
      );

      const doc = await signerClient.get("d1");

      expect(Object.keys(doc.state).sort()).toEqual([
        "auth",
        "document",
        "global",
      ]);
    });

    it("filters each result of find", async () => {
      vi.mocked(mockReactor.find).mockResolvedValue({
        results: [
          docWithScopes("d1", readGlobalPolicy, {
            global: { x: 1 },
            local: { y: 2 },
          }),
        ],
        options: { cursor: "", limit: 10 },
      });

      const page = await client.find({}, { subject: { address: "0xreader" } });

      expect(Object.keys(page.results[0].state).sort()).toEqual([
        "auth",
        "document",
        "global",
      ]);
    });

    it("gates getOperations per scope, dropping denied scopes", async () => {
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
        docWithScopes("d1", readGlobalPolicy, {}),
      );
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("d1");
      vi.mocked(mockReactor.getOperations).mockResolvedValue({
        global: {
          results: [mockOperation(0)],
          options: { cursor: "0", limit: 100 },
        },
        local: {
          results: [mockOperation(1)],
          options: { cursor: "0", limit: 100 },
        },
      });

      const page = await client.getOperations("d1", {
        branch: "main",
        subject: { address: "0xreader" },
      });

      expect(page.results.map((op) => op.index)).toEqual([0]);
      // An unnarrowed call is about to page every scope, so the gate is owed
      // every scope's state.
      expect(vi.mocked(mockReactor.getByIdOrSlug)).toHaveBeenCalledWith(
        "d1",
        { branch: "main", subject: { address: "0xreader" } },
        undefined,
        undefined,
      );
    });

    /**
     * Paging a narrowed set of scopes must not materialize every other scope of
     * the document, which this surface pays for on every page.
     */
    it("narrows the gating fetch to the scopes it will page", async () => {
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
        docWithScopes("d1", readGlobalPolicy, { global: { x: 1 } }),
      );
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("d1");

      await client.getOperations("d1", {
        branch: "main",
        scopes: ["global"],
        subject: { address: "0xreader" },
      });

      const [, fetched] = vi.mocked(mockReactor.getByIdOrSlug).mock.calls[0];

      expect(fetched?.scopes).toContain("global");
      expect(fetched?.scopes).toContain("auth");
      expect(fetched?.scopes).not.toContain("local");
    });

    /**
     * A gate that cannot resolve must not degrade into an ungated read. The
     * fetch throws on absence, which is what every other read path here does.
     */
    it("propagates a failed gate fetch rather than serving ungated operations", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("d1");
      vi.mocked(mockReactor.getByIdOrSlug).mockRejectedValue(
        new Error("Document not found: d1"),
      );

      await expect(client.getOperations("d1")).rejects.toThrow(
        "Document not found",
      );
      expect(mockReactor.getOperations).not.toHaveBeenCalled();
    });

    /**
     * The narrowing must keep the paged scope's own state, which is the one
     * thing the wide fetch was protecting: a conditional read grant resolves
     * against the state of the scope it gates.
     */
    describe("a conditional read grant on a scope-narrowed getOperations", () => {
      const conditionalPolicy = {
        version: 1,
        grants: [
          {
            id: "g-read-open",
            description: "anyone reads global while it is open",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "read", scope: "global" },
            where: { eq: [{ attr: "doc.global.status" }, { lit: "OPEN" }] },
          },
        ],
      };

      async function pageGlobal(status: string): Promise<number[]> {
        const model = readDecisionModel(
          resolveFeatureFlags({
            documentDecisions: true,
            authEnforcement: true,
            authGroups: true,
            authConditions: true,
          }),
          { getModule: () => ({}) } as never,
        );
        if (!model) {
          throw new Error("expected a model");
        }

        const gating = new ReactorClient(
          createMockLogger(),
          mockReactor,
          createMockSigner(),
          mockSubscriptionManager,
          mockJobAwaiter,
          mockDocumentIndexer,
          mockDocumentView,
          new ModelReadGate(model, mockDocumentView, true),
        );

        // Only what a narrowed fetch yields, so the test cannot pass by
        // reading state the narrowing would have dropped.
        vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue(
          docWithScopes("d1", conditionalPolicy, { global: { status } }),
        );
        vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("d1");
        vi.mocked(mockReactor.getOperations).mockResolvedValue({
          global: {
            results: [mockOperation(0)],
            options: { cursor: "0", limit: 100 },
          },
        });

        const page = await gating.getOperations("d1", {
          branch: "main",
          scopes: ["global"],
          subject: { address: "0xother" },
        });
        return page.results.map((op) => op.index);
      }

      it("serves the scope while its own state satisfies the condition", async () => {
        expect(await pageGlobal("OPEN")).toEqual([0]);
      });

      it("withholds the scope when its state does not", async () => {
        expect(await pageGlobal("CLOSED")).toEqual([]);
      });
    });

    /**
     * A subscription serves documents, so it is a read. The filter lives on the
     * client because the read models feeding it see everything.
     */
    describe("subscribe", () => {
      it("filters unreadable scopes out of the created callback", async () => {
        const created = vi.fn();
        let fire: ((result: { results: string[] }) => void) | undefined;
        const manager = createMockSubscriptionManager({
          onDocumentCreated: vi.fn((cb: (r: { results: string[] }) => void) => {
            fire = cb;
            return () => {};
          }) as never,
        });

        const subscribing = new ReactorClient(
          createMockLogger(),
          mockReactor,
          createMockSigner(),
          manager,
          mockJobAwaiter,
          mockDocumentIndexer,
          mockDocumentView,
        );

        vi.mocked(mockReactor.get).mockResolvedValue(
          docWithScopes("d1", readGlobalPolicy, {
            global: { x: 1 },
            local: { y: 2 },
          }),
        );

        subscribing.subscribe({}, created, {
          subject: { address: "0xreader" },
        });

        fire?.({ results: ["d1"] });
        await vi.waitFor(() => expect(created).toHaveBeenCalled());

        const event = created.mock.calls[0][0] as {
          documents: PHDocument[];
        };
        expect(Object.keys(event.documents[0].state).sort()).toEqual([
          "auth",
          "document",
          "global",
        ]);
      });

      it("filters unreadable scopes out of the updated callback", async () => {
        const updated = vi.fn();
        let fire: ((result: { results: PHDocument[] }) => void) | undefined;
        const manager = createMockSubscriptionManager({
          onDocumentStateUpdated: vi.fn(
            (cb: (r: { results: PHDocument[] }) => void) => {
              fire = cb;
              return () => {};
            },
          ) as never,
        });

        const subscribing = new ReactorClient(
          createMockLogger(),
          mockReactor,
          createMockSigner(),
          manager,
          mockJobAwaiter,
          mockDocumentIndexer,
          mockDocumentView,
        );

        subscribing.subscribe({}, updated, {
          subject: { address: "0xreader" },
        });

        fire?.({
          results: [
            docWithScopes("d1", readGlobalPolicy, {
              global: { x: 1 },
              local: { y: 2 },
            }),
          ],
        });

        await vi.waitFor(() => expect(updated).toHaveBeenCalled());

        const event = updated.mock.calls[0][0] as { documents: PHDocument[] };
        expect(Object.keys(event.documents[0].state).sort()).toEqual([
          "auth",
          "document",
          "global",
        ]);
      });
    });

    it("forwards a view when resolving an identifier", async () => {
      vi.mocked(mockDocumentView.resolveIdOrSlug).mockResolvedValue("d1");

      await client.resolveIdOrSlug("some-slug", { branch: "other" });

      expect(vi.mocked(mockDocumentView.resolveIdOrSlug)).toHaveBeenCalledWith(
        "some-slug",
        { branch: "other" },
        undefined,
        undefined,
      );
    });

    /**
     * Turning authEnforcement on must not change what a policy that uses no
     * groups and no conditions serves. The two gates are different code paths --
     * one evaluates the policy directly, the other builds the decision model
     * and asks it -- so this pins them to the same answer over the policies
     * where they are meant to agree, including the carve-out and the version
     * gate. Where they are meant to differ is covered in the read-gate tests:
     * only the model gate applies a group or conditional grant.
     */
    describe("agreement between the bare and model read gates", () => {
      const uninitialized: PHAuthState = { version: 0, grants: [] };
      const allowAll: PHAuthState = {
        version: 1,
        grants: [
          {
            id: "g-open",
            description: "anyone reads anything",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "read", scope: "*" },
          },
        ],
      };
      const denyAll: PHAuthState = { version: 1, grants: [] };
      const addressMatched: PHAuthState =
        readGlobalPolicy as unknown as PHAuthState;
      const versionTooNew: PHAuthState = {
        version: MAX_SUPPORTED_AUTH_VERSION + 1,
        grants: [
          {
            id: "g-open",
            description: "anyone reads anything",
            effect: "allow",
            principal: { anyone: true },
            capability: { can: "read", scope: "*" },
          },
        ],
      };

      const policies: Array<[string, PHAuthState]> = [
        ["uninitialized", uninitialized],
        ["allow-all", allowAll],
        ["deny-all", denyAll],
        ["address-matched", addressMatched],
        ["version-too-new", versionTooNew],
      ];
      const subjects: Array<[string, AuthSubject]> = [
        ["the matched reader", { address: "0xreader" }],
        ["another address", { address: "0xsomeone-else" }],
        ["anonymous", {}],
      ];

      const bare: IReadGate = new BareReadGate();

      function modelGate(): IReadGate {
        const model = readDecisionModel(
          resolveFeatureFlags({
            documentDecisions: true,
            authEnforcement: true,
            authGroups: true,
            authConditions: true,
          }),
          { getModule: () => ({}) } as never,
        );
        if (!model) {
          throw new Error("expected a model");
        }
        return new ModelReadGate(model, mockDocumentView, true);
      }

      async function bothSay(
        auth: PHAuthState,
        subject: AuthSubject,
        scope: string,
        isDeleted: boolean,
      ): Promise<[boolean, boolean]> {
        const document = docWithScopes("d1", auth, {
          global: {},
          custom: {},
        });
        (document.state as Record<string, unknown>).document = { isDeleted };

        const bareSays = await bare.scopePredicate(document, subject, "main");
        const modelSays = await modelGate().scopePredicate(
          document,
          subject,
          "main",
        );
        return [bareSays(scope), modelSays(scope)];
      }

      it.each(policies)(
        "agree on a domain scope under a %s policy",
        async (_name, auth) => {
          for (const [, subject] of subjects) {
            for (const isDeleted of [false, true]) {
              for (const scope of ["global", "custom"]) {
                const [bareSays, modelSays] = await bothSay(
                  auth,
                  subject,
                  scope,
                  isDeleted,
                );
                expect(modelSays).toBe(bareSays);
              }
            }
          }
        },
      );

      /**
       * The one carve-out, by name. A peer that synced a document without its
       * policy would see an open auth scope and diverge permanently.
       */
      it.each(["auth", "document"])(
        "both always serve the %s scope, whatever the policy says",
        async (scope) => {
          for (const [, auth] of policies) {
            for (const [, subject] of subjects) {
              const [bareSays, modelSays] = await bothSay(
                auth,
                subject,
                scope,
                false,
              );
              expect(bareSays).toBe(true);
              expect(modelSays).toBe(true);
            }
          }
        },
      );

      // A read has no position, so the positional deletion step does not gate it.
      it("neither lets deletion change a read decision", async () => {
        for (const auth of [allowAll, denyAll]) {
          const deleted = await bothSay(auth, {}, "global", true);
          const live = await bothSay(auth, {}, "global", false);
          expect(deleted).toEqual(live);
        }
      });
    });
  });
});
