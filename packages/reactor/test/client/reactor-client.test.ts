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
import { createEmptyConsistencyToken } from "../factories.js";
import type { IReactorSubscriptionManager } from "../../src/subs/types.js";

describe("ReactorClient Unit Tests", () => {
  let client: IReactorClient;
  let mockReactor: IReactor;
  let mockSigner: ISigner;
  let mockSubscriptionManager: IReactorSubscriptionManager;
  let mockJobAwaiter: IJobAwaiter;

  beforeEach(() => {
    mockReactor = {
      getDocumentModels: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "", limit: 10 },
      }),
      get: vi.fn(),
      getBySlug: vi.fn(),
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

    mockSigner = {
      sign: vi.fn().mockResolvedValue(["mock-signature", "", "", "", ""]),
    };

    mockSubscriptionManager = {
      onDocumentCreated: vi.fn(),
      onDocumentDeleted: vi.fn(),
      onDocumentStateUpdated: vi.fn(),
      onRelationshipChanged: vi.fn(),
    };

    mockJobAwaiter = {
      waitForJob: vi.fn().mockResolvedValue({
        id: "job-1",
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
      }),
      shutdown: vi.fn(),
    };

    client = new ReactorClient(
      mockReactor,
      mockSigner,
      mockSubscriptionManager,
      mockJobAwaiter,
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
    it("should try get by ID first", async () => {
      const mockDoc: PHDocument = {
        header: { id: "doc-1", documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.get).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.get("doc-1");

      expect(mockReactor.get).toHaveBeenCalledWith(
        "doc-1",
        undefined,
        undefined,
        undefined,
      );
      expect(result.document).toEqual(mockDoc);
    });

    it("should fallback to getBySlug if get by ID fails", async () => {
      const mockDoc: PHDocument = {
        header: { id: "doc-1", documentType: "test", slug: "my-doc" },
      } as PHDocument;

      vi.mocked(mockReactor.get).mockRejectedValue(new Error("Not found"));
      vi.mocked(mockReactor.getBySlug).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.get("my-doc");

      expect(mockReactor.get).toHaveBeenCalledWith(
        "my-doc",
        undefined,
        undefined,
        undefined,
      );
      expect(mockReactor.getBySlug).toHaveBeenCalledWith(
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

      vi.mocked(mockReactor.get).mockResolvedValue({
        document: {} as PHDocument,
        childIds: [],
      });

      await client.get("doc-1", view, signal);

      expect(mockReactor.get).toHaveBeenCalledWith(
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
    it("should call reactor.mutate, wait for job, and return document", async () => {
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
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      const mockDoc: PHDocument = {
        header: { id: documentId, documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.mutate).mockResolvedValue(jobInfo);
      vi.mocked(mockJobAwaiter.waitForJob).mockResolvedValue(completedJobInfo);
      vi.mocked(mockReactor.get).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.mutate(documentId, actions);

      expect(mockReactor.mutate).toHaveBeenCalledWith(documentId, actions);
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.get).toHaveBeenCalledWith(
        documentId,
        undefined,
        undefined,
        undefined,
      );
      expect(result).toEqual(mockDoc);
    });

    it("should pass view and signal parameters", async () => {
      const documentId = "doc-1";
      const actions: Action[] = [];
      const view = { branch: "feature" };
      const signal = new AbortController().signal;

      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.mutate).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.get).mockResolvedValue({
        document: {} as PHDocument,
        childIds: [],
      });

      await client.mutate(documentId, actions, view, signal);

      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
      expect(mockReactor.get).toHaveBeenCalledWith(
        documentId,
        view,
        undefined,
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

      const result = await client.mutateAsync(documentId, actions);

      expect(mockSigner.sign).toHaveBeenCalledWith(actions[0], undefined);
      expect(mockReactor.mutate).toHaveBeenCalledWith(
        documentId,
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

      await client.mutateAsync(documentId, actions, undefined, signal);

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

      const mockDoc: PHDocument = {
        header: { id: parentId, documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.addChildren).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.get).mockResolvedValue({
        document: mockDoc,
        childIds: ["child-1", "child-2"],
      });

      const result = await client.addChildren(parentId, childIds);

      expect(mockReactor.addChildren).toHaveBeenCalledWith(
        parentId,
        childIds,
        undefined,
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.get).toHaveBeenCalledWith(
        parentId,
        undefined,
        undefined,
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

      const mockDoc: PHDocument = {
        header: { id: parentId, documentType: "test" },
      } as PHDocument;

      vi.mocked(mockReactor.removeChildren).mockResolvedValue(jobInfo);
      vi.mocked(mockReactor.get).mockResolvedValue({
        document: mockDoc,
        childIds: [],
      });

      const result = await client.removeChildren(parentId, childIds);

      expect(mockReactor.removeChildren).toHaveBeenCalledWith(
        parentId,
        childIds,
        undefined,
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
      expect(mockReactor.get).toHaveBeenCalledWith(
        parentId,
        undefined,
        undefined,
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
        undefined,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith(
        "job-1",
        undefined,
      );
    });

    it("should pass propagate and signal parameters", async () => {
      const documentId = "doc-1";
      const propagate = PropagationMode.Cascade;
      const signal = new AbortController().signal;

      const jobInfo: JobInfo = {
        id: "job-1",
        status: JobStatus.PENDING,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      };

      vi.mocked(mockReactor.deleteDocument).mockResolvedValue(jobInfo);

      await client.deleteDocument(documentId, propagate, signal);

      expect(mockReactor.deleteDocument).toHaveBeenCalledWith(
        documentId,
        propagate,
        signal,
      );
      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
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
        status: JobStatus.COMPLETED,
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
        status: JobStatus.COMPLETED,
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
        status: JobStatus.COMPLETED,
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
        status: JobStatus.COMPLETED,
        createdAtUtcIso: new Date().toISOString(),
        consistencyToken: createEmptyConsistencyToken(),
      });

      await client.waitForJob("job-1", signal);

      expect(mockJobAwaiter.waitForJob).toHaveBeenCalledWith("job-1", signal);
    });
  });

  describe("Error Handling", () => {
    it("should propagate errors from reactor.get", async () => {
      const error = new Error("Get failed");
      vi.mocked(mockReactor.get).mockRejectedValue(error);
      vi.mocked(mockReactor.getBySlug).mockRejectedValue(error);

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

      await expect(client.mutate("doc-1", [])).rejects.toThrow(
        "Job wait failed",
      );
    });

    it("should propagate errors from signer.sign", async () => {
      const error = new Error("Signing failed");
      vi.mocked(mockSigner.sign).mockRejectedValue(error);

      await expect(
        client.mutateAsync("doc-1", [
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
