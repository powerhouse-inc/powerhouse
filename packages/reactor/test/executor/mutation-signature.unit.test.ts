import type { SignatureVerificationHandler } from "#index.js";
import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { Job } from "../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { InvalidSignatureError } from "../../src/shared/errors.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import {
  createMockDocumentStorage,
  createMockOperationStorage,
  createMockOperationStore,
  createSignedTestAction,
  createTestAction,
} from "../factories.js";
import { SimpleSigner } from "../utils/simple-signer.js";

describe("SimpleJobExecutor mutation signature verification", () => {
  let executor: SimpleJobExecutor;
  let signer: SimpleSigner;
  let mockDocStorage: IDocumentStorage;
  let mockOperationStorage: IDocumentOperationStorage;
  let mockOperationStore: IOperationStore;
  let mockWriteCache: IWriteCache;
  let registry: IDocumentModelRegistry;

  beforeEach(() => {
    signer = new SimpleSigner();

    const mockReducer = vi.fn().mockImplementation((doc, action) => {
      const nextIndex =
        Math.max(
          ...Object.values(doc.header.revision as Record<string, number>),
        ) || 0;
      return {
        ...doc,
        operations: {
          ...doc.operations,
          [action.scope]: [
            ...(doc.operations[action.scope] || []),
            {
              index: nextIndex,
              skip: 0,
              hash: "test-hash",
              timestampUtcMs: action.timestampUtcMs,
              action: action,
            },
          ],
        },
      };
    });

    registry = {
      getModule: vi.fn().mockReturnValue({ reducer: mockReducer }),
      registerModules: vi.fn(),
    } as unknown as IDocumentModelRegistry;

    mockDocStorage = createMockDocumentStorage();
    mockOperationStorage = createMockOperationStorage();
    mockOperationStore = createMockOperationStore();

    mockOperationStore.apply = vi
      .fn()
      .mockImplementation(
        async (_docId, _docType, _scope, _branch, _rev, fn) => {
          const txn = {
            addOperations: vi.fn(),
          };
          await fn(txn as never);
        },
      );

    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { document: 0 },
      latestTimestamp: new Date().toISOString(),
    });

    mockWriteCache = {
      getState: vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "powerhouse/document",
          revision: { document: 5 },
        },
        state: {
          document: {
            isDeleted: false,
          },
          global: {},
        },
        operations: {
          document: [],
          global: [],
        },
      }),
      putState: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };

    const mockOperationIndex: never = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    } as never;

    const verificationHandler: SignatureVerificationHandler = async (
      operation,
    ) => {
      const signerData = operation.action.context?.signer;
      if (!signerData || signerData.signatures.length === 0) {
        return false;
      }

      const signature = signerData.signatures[0];
      const signatureHex = signature[4].startsWith("0x")
        ? signature[4].slice(2)
        : signature[4];

      const actionWithoutSigner = { ...operation.action };
      if (actionWithoutSigner.context) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { signer: _signer, ...restContext } = actionWithoutSigner.context;
        if (Object.keys(restContext).length === 0) {
          delete actionWithoutSigner.context;
        } else {
          actionWithoutSigner.context = restContext;
        }
      }

      const dataToSign = JSON.stringify({
        action: actionWithoutSigner,
        index: operation.index,
        timestamp: operation.timestampUtcMs,
      });

      return signer.verify(new TextEncoder().encode(dataToSign), signatureHex);
    };

    executor = new SimpleJobExecutor(
      registry,
      mockDocStorage,
      mockOperationStorage,
      mockOperationStore,
      {
        emit: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
      } as never,
      mockWriteCache,
      mockOperationIndex,
      { legacyStorageEnabled: true },
      verificationHandler,
    );
  });

  it("accepts mutation jobs with valid signatures", async () => {
    const action = await createSignedTestAction(signer, {
      scope: "document",
    });

    const job: Job = {
      id: "job-1",
      kind: "mutation",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [action],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(true);
  });

  it("rejects mutation jobs with invalid signatures", async () => {
    const action = await createSignedTestAction(signer, {
      scope: "document",
    });

    const tampered = {
      ...action,
      context: {
        ...action.context,
        signer: {
          ...action.context!.signer!,
          signatures: [
            ["0", "0", "0", "0", "0xdeadbeef"] as [
              string,
              string,
              string,
              string,
              string,
            ],
          ],
        },
      },
    };

    const job: Job = {
      id: "job-1",
      kind: "mutation",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [tampered],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(InvalidSignatureError);
  });

  it("accepts unsigned mutation jobs for backwards compatibility", async () => {
    const action = createTestAction({ scope: "document" });

    const job: Job = {
      id: "job-1",
      kind: "mutation",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [action],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(true);
  });

  it("rejects mutation jobs with signer but no signatures", async () => {
    const action = createTestAction({ scope: "document" });
    const actionWithEmptySignatures = {
      ...action,
      context: {
        signer: {
          user: { address: "0x123", chainId: 1, networkId: "1" },
          app: { name: "test", key: "0xpubkey" },
          signatures: [],
        },
      },
    };

    const job: Job = {
      id: "job-1",
      kind: "mutation",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [actionWithEmptySignatures],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(InvalidSignatureError);
    expect(result.error?.message).toContain("no signatures");
  });

  it("fails fast on first invalid signature", async () => {
    const validAction1 = await createSignedTestAction(signer, {
      scope: "document",
    });

    const invalidAction = await createSignedTestAction(signer, {
      scope: "document",
    });
    const tamperedAction = {
      ...invalidAction,
      context: {
        ...invalidAction.context,
        signer: {
          ...invalidAction.context!.signer!,
          signatures: [
            ["0", "0", "0", "0", "0xbad"] as [
              string,
              string,
              string,
              string,
              string,
            ],
          ],
        },
      },
    };

    const validAction2 = await createSignedTestAction(signer, {
      scope: "document",
    });

    const job: Job = {
      id: "job-1",
      kind: "mutation",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [validAction1, tamperedAction, validAction2],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(InvalidSignatureError);
  });

  it("does not write operations when signature fails", async () => {
    const action = await createSignedTestAction(signer, {
      scope: "document",
    });

    const tampered = {
      ...action,
      context: {
        ...action.context,
        signer: {
          ...action.context!.signer!,
          signatures: [
            ["0", "0", "0", "0", "0xbad"] as [
              string,
              string,
              string,
              string,
              string,
            ],
          ],
        },
      },
    };

    const job: Job = {
      id: "job-1",
      kind: "mutation",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [tampered],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const writeOpsSpy = vi.spyOn(mockOperationStore, "apply");

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(writeOpsSpy).not.toHaveBeenCalled();
  });

  it("reports action ID in error messages", async () => {
    const action1 = await createSignedTestAction(signer, {
      scope: "document",
    });

    const action2 = await createSignedTestAction(signer, {
      scope: "document",
    });
    const tamperedAction2 = {
      ...action2,
      context: {
        ...action2.context,
        signer: {
          ...action2.context!.signer!,
          signatures: [
            ["0", "0", "0", "0", "0xbad"] as [
              string,
              string,
              string,
              string,
              string,
            ],
          ],
        },
      },
    };

    const action3 = await createSignedTestAction(signer, {
      scope: "document",
    });

    const job: Job = {
      id: "job-1",
      kind: "mutation",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [action1, tamperedAction2, action3],
      operations: [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(InvalidSignatureError);
    expect(result.error?.message).toContain(action2.id);
  });
});
