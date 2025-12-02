import type { Action, DocumentModelModule, PHDocument } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorClient } from "../../src/client/reactor-client.js";
import type { IReactorClient } from "../../src/client/types.js";
import type { IReactor } from "../../src/core/types.js";
import type { IJobAwaiter } from "../../src/shared/awaiter.js";
import {
  JobStatus,
  PropagationMode,
  type JobInfo,
  type PagedResults,
} from "../../src/shared/types.js";
import type { ISigner } from "../../src/signer/types.js";
import type { IDocumentIndexer } from "../../src/storage/interfaces.js";
import type { IReactorSubscriptionManager } from "../../src/subs/types.js";
import {
  createEmptyConsistencyToken,
  createMockDocumentIndexer,
  createMockJobAwaiter,
  createMockSigner,
  createMockSubscriptionManager,
} from "../factories.js";

describe("ReactorClient Unit Tests", () => {
  let client: IReactorClient;
  let mockReactor: IReactor;
  let mockSigner: ISigner;
  let mockSubscriptionManager: IReactorSubscriptionManager;
  let mockJobAwaiter: IJobAwaiter;
  let mockDocumentIndexer: IDocumentIndexer;

  beforeEach(() => {
    mockDocumentIndexer = createMockDocumentIndexer();

    mockReactor = {
      documentIndexer: mockDocumentIndexer,
      getDocumentModels: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "", limit: 10 },
      }),
      get: vi.fn(),
      getBySlug: vi.fn(),
      getByIdOrSlug: vi.fn(),
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "", limit: 10 },
      }),
      mutate: vi.fn(),
      addChildren: vi.fn(),
      removeChildren: vi.fn(),
      deleteDocument: vi.fn(),
      getJobStatus: vi.fn(),
    } as unknown as IReactor;

    mockSigner = createMockSigner();

    mockSubscriptionManager = createMockSubscriptionManager();

    mockJobAwaiter = createMockJobAwaiter();

    client = new ReactorClient(
      mockReactor,
      mockSigner,
      mockSubscriptionManager,
      mockJobAwaiter,
      mockDocumentIndexer,
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

      const result = await client.getDocumentModels();

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

      await client.getDocumentModels(namespace, paging, signal);

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
        header: { id: "doc-1", documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.get("doc-1");

      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        "doc-1",
        undefined,
        undefined,
        undefined,
      );
      expect(result.document).toEqual(mockDoc);
    });

    it("should resolve both IDs and slugs", async () => {
      const mockDoc: PHDocument = {
        header: { id: "doc-1", documentType: "test", slug: "my-doc" },
      } as PHDocument;

      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.get("my-doc");

      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        "my-doc",
        undefined,
        undefined,
        undefined,
      );
      expect(result.document.header.slug).toBe("my-doc");
    });

    it("should pass view and signal parameters", async () => {
      const view = { branch: "main" };
      const signal = new AbortController().signal;

      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: {} as PHDocument,
        childIds: [],
      });

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

  describe("mutate", () => {
    it("should sign actions and call reactor.mutate, wait for job, and return document", async () => {
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
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const completedJobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const mockDoc: PHDocument = {
        header: { id: documentId, documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.mutate).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.mutate(documentId, "main", actions);

      expect(mockSigner.sign).toHaveBeenCalledWith(actions[0], undefined);
      expect(mockReactor.mutate).toHaveBeenCalledWith(
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
                signatures: [["mock-signature", "", "", "", ""]],
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
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.mutate).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: {} as PHDocument,
        childIds: [],
      });

      await client.mutate(documentId, "main", actions, signal);

      expect(mockSigner.sign).toHaveBeenCalledWith(actions[0], signal);
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
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.mutate).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: {} as PHDocument,
        childIds: [],
      });

      await client.mutate(documentId, "main", actions);

      expect(mockSigner.sign).toHaveBeenCalledTimes(2);
      expect(mockSigner.sign).toHaveBeenCalledWith(actions[0], undefined);
      expect(mockSigner.sign).toHaveBeenCalledWith(actions[1], undefined);
    });

    it("should pass view and signal parameters", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [];
      const branch = "feature";
      const signal = new AbortController().signal;

      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.mutate).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: {} as PHDocument,
        childIds: [],
      });

      await client.mutate(documentId, branch, actions, signal);

      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        documentId,
        { branch },
        expect.any(Object),
        signal,
      );
    });
  });

  describe("mutateAsync", () => {
    it("should sign actions and call reactor.mutate", async () => {
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
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.mutate).mockResolvedValue(jobInfo);

      const result = await client.mutateAsync(documentId, "main", actions);

      expect(mockSigner.sign).toHaveBeenCalledWith(actions[0], undefined);
      expect(mockReactor.mutate).toHaveBeenCalledWith(
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
                signatures: [["mock-signature", "", "", "", ""]],
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

      vi.mocked(mockReactor.mutate).mockResolvedValue({
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });

      await client.mutateAsync(documentId, "main", actions, signal);

      expect(mockSigner.sign).toHaveBeenCalledWith(actions[0], signal);
    });
  });

  describe("addChildren", () => {
    it("should call reactor.addChildren, wait for job, and return parent document", async () => {
      const parentId = "parent-1";
      const childIds = ["child-1", "child-2"];

      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const completedJobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const mockDoc: PHDocument = {
        header: { id: parentId, documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.addChildren).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: mockDoc,
        childIds: ["child-1", "child-2"],
      });

      const result = await client.addChildren(parentId, childIds);

      expect(mockReactor.addChildren).toHaveBeenCalledWith(
        parentId,
        childIds,
        "main",
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        parentId,
        { branch: "main" },
        completedJobInfo.consistencyToken,
        undefined,
      );
      expect(result).toEqual(mockDoc);
    });
  });

  describe("removeChildren", () => {
    it("should call reactor.removeChildren, wait for job, and return parent document", async () => {
      const parentId = "parent-1";
      const childIds = ["child-1"];

      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const completedJobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const mockDoc: PHDocument = {
        header: { id: parentId, documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.removeChildren).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.getByIdOrSlug).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.removeChildren(parentId, childIds);

      expect(mockReactor.removeChildren).toHaveBeenCalledWith(
        parentId,
        childIds,
        "main",
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.getByIdOrSlug).toHaveBeenCalledWith(
        parentId,
        { branch: "main" },
        completedJobInfo.consistencyToken,
        undefined,
      );
      expect(result).toEqual(mockDoc);
    });
  });

  describe("deleteDocument", () => {
    it("should call reactor.deleteDocument and wait for job", async () => {
      const documentId = "doc-1";

      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(jobInfo);

      await client.deleteDocument(documentId);

      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(
        documentId,
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
    });

    it("should pass signal parameter", async () => {
      const documentId = "doc-1";
      const signal = new AbortController().signal;

      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(jobInfo);

      await client.deleteDocument(documentId, PropagationMode.None, signal);

      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(
        documentId,
        signal,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
    });

    it("should cascade delete children when propagate is Cascade", async () => {
      const parentId = "parent-1";
      const childId = "child-1";
      const signal = new AbortController().signal;

      const parentJobInfo: JobInfo = {
        id: "job-parent",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const childJobInfo: JobInfo = {
        id: "job-child",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockDocumentIndexer.getOutgoing).mockResolvedValue([
        {
          sourceId: parentId,
          targetId: childId,
          relationshipType: "child",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(childJobInfo);
      vi.mocked(mockReactor.deleteDocument).mockResolvedValueOnce(childJobInfo);
      vi.mocked(mockReactor.deleteDocument).mockResolvedValueOnce(
        parentJobInfo,
      );

      await client.deleteDocument(parentId, PropagationMode.Cascade, signal);

      expect(mockDocumentIndexer.getOutgoing).toHaveBeenCalledWith(
        parentId,
        ["child"],
        undefined,
        signal,
      );
      expect(mockReactor.deleteDocument).toHaveBeenCalledTimes(2);
      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(childId, signal);
      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(parentId, signal);
    });
  });

  describe("getJobStatus", () => {
    it("should pass through to reactor.getJobStatus", async () => {
      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.RUNNING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });

      await client.getJobStatus("job-1", signal);

      expect(mockReactor.getJobStatus).toHaveBeenCalledWith("job-1", signal);
    });
  });

  describe("waitForJob", () => {
    it("should call jobAwaiter.waitForJob with job ID string", async () => {
      const completedJobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const completedJobInfo: JobInfo = {
        ...jobInfo,
        status: JobStatus.READ_MODELS_READY,
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
        status: JobStatus.READ_MODELS_READY,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
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

      vi.mocked(mockReactor.mutate).mockResolvedValue({
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });
      vi.mocked(mockJobAwaiter.waitForJob).mockRejectedValue(error);

      await expect(client.mutate("doc-1", "main", [])).rejects.toThrow(
        "Job wait failed",
      );
    });

    it("should propagate errors from signer.sign", async () => {
      const error = new Error("Signing failed");
      vi.mocked(mockSigner.sign).mockRejectedValue(error);

      await expect(
        client.mutateAsync("doc-1", "main", [
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
});
