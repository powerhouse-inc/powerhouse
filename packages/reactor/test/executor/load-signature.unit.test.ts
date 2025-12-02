import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { SignatureVerificationHandler } from "../../src/executor/types.js";
import type { Job } from "../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { InvalidSignatureError } from "../../src/shared/errors.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import {
  createMockDocumentStorage,
  createMockOperationStorage,
  createMockOperationStore,
  createSignedTestOperation,
  createTestAction,
  createTestOperation,
} from "../factories.js";
import { SimpleSigner } from "../utils/simple-signer.js";

describe("SimpleJobExecutor signature verification", () => {
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
      commit: vi.fn().mockResolvedValue(undefined),
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

  it("accepts operations with valid signatures", async () => {
    const operation = await createSignedTestOperation(signer, {
      index: 0,
      action: createTestAction({ scope: "document" }),
    });

    const job: Job = {
      id: "job-1",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations: [operation],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(true);
  });

  it("rejects operations with invalid signatures", async () => {
    const operation = await createSignedTestOperation(signer, {
      index: 0,
      action: createTestAction({ scope: "document" }),
    });

    const tampered = {
      ...operation,
      action: {
        ...operation.action,
        context: {
          ...operation.action.context,
          signer: {
            ...operation.action.context!.signer!,
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
      },
    };

    const job: Job = {
      id: "job-1",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations: [tampered],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(InvalidSignatureError);
  });

  it("accepts unsigned operations for backwards compatibility", async () => {
    const operation = createTestOperation({
      index: 0,
      action: createTestAction({ scope: "document" }),
    });

    const job: Job = {
      id: "job-1",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations: [operation],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(true);
  });

  it("rejects operations with signer but no signatures", async () => {
    const operation = createTestOperation({
      index: 0,
      action: {
        ...createTestAction({ scope: "document" }),
        context: {
          signer: {
            user: { address: "0x123", chainId: 1, networkId: "1" },
            app: { name: "test", key: "0xpubkey" },
            signatures: [],
          },
        },
      },
    });

    const job: Job = {
      id: "job-1",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations: [operation],
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
    const validOp = await createSignedTestOperation(signer, {
      index: 0,
      action: createTestAction({ scope: "document" }),
    });

    const invalidOp = createTestOperation({
      index: 1,
      action: {
        ...createTestAction({ scope: "document" }),
        context: {
          signer: {
            user: { address: "0x123", chainId: 1, networkId: "1" },
            app: { name: "test", key: "0xpubkey" },
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
      },
    });

    const job: Job = {
      id: "job-1",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations: [validOp, invalidOp],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(InvalidSignatureError);
  });

  it("verifies signatures before reshuffling", async () => {
    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { document: 0 },
      latestTimestamp: new Date().toISOString(),
    });

    const writeOpsSpy = vi.spyOn(mockOperationStore, "apply");

    const invalidOp = createTestOperation({
      index: 0,
      action: {
        ...createTestAction({ scope: "document" }),
        context: {
          signer: {
            user: { address: "0x123", chainId: 1, networkId: "1" },
            app: { name: "test", key: "0xpubkey" },
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
      },
    });

    const job: Job = {
      id: "job-1",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations: [invalidOp],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);
    expect(result.success).toBe(false);
    expect(writeOpsSpy).not.toHaveBeenCalled();
  });
});
