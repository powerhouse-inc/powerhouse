import {
  DriveCollectionId,
  type IReactorClient,
  type ISyncManager,
  type PagedResults,
} from "@powerhousedao/reactor";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";

describe("ReactorSubgraph Permission Checks", () => {
  let mockAuthorizationService: Partial<IAuthorizationService>;
  let mockReactorClient: Partial<IReactorClient>;
  let reactorSubgraph: ReactorSubgraph;

  // Mock document data with full structure expected by resolvers
  const createMockDocument = (id: string, name: string): PHDocument =>
    ({
      header: {
        id,
        slug: id,
        name,
        documentType: "test/document",
        revision: { global: 1 },
        createdAtUtcIso: new Date().toISOString(),
        lastModifiedAtUtcIso: new Date().toISOString(),
      },
      state: {
        global: { name },
        local: {},
      },
      initialState: {
        global: { name },
        local: {},
      },
      operations: {
        global: [],
        local: [],
      },
      clipboard: [],
    }) as unknown as PHDocument;

  const mockDocument = createMockDocument("doc-123", "Test Document");
  const mockParentDocument = createMockDocument(
    "parent-123",
    "Parent Document",
  );

  // Helper to create context with different user states
  const createContext = (options: { userAddress?: string }) => ({
    user: options.userAddress ? { address: options.userAddress } : undefined,
    headers: {},
    db: {},
  });

  const buildSubgraph = (
    authSvc: Partial<IAuthorizationService>,
    syncManager: Partial<ISyncManager> = {},
  ): ReactorSubgraph =>
    new ReactorSubgraph({
      reactorClient: mockReactorClient as IReactorClient,
      authorizationService: authSvc as IAuthorizationService,
      relationalDb: {} as any,
      analyticsStore: {} as any,
      graphqlManager: {
        driveOwnershipCache: {
          has: () => false,
          add: () => undefined,
          remove: () => undefined,
          size: () => 0,
        },
      } as any,
      syncManager: syncManager as ISyncManager,
    } as SubgraphArgs);

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: DOCUMENT_PERMISSIONS policy, non-admin, all decisions false
    mockAuthorizationService = {
      config: {
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
      },
      isSupremeAdmin: vi.fn().mockReturnValue(false),
      canCreate: vi.fn().mockImplementation((address?: string) => !!address),
      canRead: vi.fn().mockResolvedValue(false),
      canWrite: vi.fn().mockResolvedValue(false),
      canManage: vi.fn().mockResolvedValue(false),
      canMutate: vi.fn().mockResolvedValue(false),
    };

    // Create mock ReactorClient
    mockReactorClient = {
      get: vi.fn().mockResolvedValue(mockDocument),
      resolveIdOrSlug: vi.fn((identifier: string) =>
        Promise.resolve(identifier),
      ),
      getOutgoingRelationships: vi.fn().mockResolvedValue({
        results: [],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      getIncomingRelationships: vi.fn().mockResolvedValue({
        results: [],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      find: vi.fn().mockResolvedValue({
        results: [mockDocument],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      create: vi.fn().mockResolvedValue(mockDocument),
      createEmpty: vi.fn().mockResolvedValue(mockDocument),
      execute: vi.fn().mockResolvedValue(mockDocument),
      executeAsync: vi.fn().mockResolvedValue("job-123"),
      rename: vi.fn().mockResolvedValue(mockDocument),
      addRelationship: vi.fn().mockResolvedValue(mockParentDocument),
      removeRelationship: vi.fn().mockResolvedValue(mockParentDocument),
      moveRelationship: vi.fn().mockResolvedValue({
        source: mockParentDocument,
        target: mockParentDocument,
      }),
      deleteDocument: vi.fn().mockResolvedValue(true),
      deleteDocuments: vi.fn().mockResolvedValue(true),
      getDocumentModelModules: vi
        .fn()
        .mockResolvedValue({ results: [], options: {} }),
      getJobStatus: vi.fn(),
      waitForJob: vi.fn(),
      subscribe: vi.fn(),
    };

    reactorSubgraph = buildSubgraph(mockAuthorizationService);
  });

  // ============================================================
  // Query: document
  // ============================================================
  describe("Query: document", () => {
    const callDocument = (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      return query(null, { identifier: "doc-123" }, ctx);
    };

    it("should allow access when authorizationService.canRead resolves true", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callDocument(ctx);

      expect(result).toBeDefined();
      expect(mockAuthorizationService.canRead).toHaveBeenCalled();
    });

    it("should deny access when authorizationService.canRead resolves false", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callDocument(ctx)).rejects.toThrow("Forbidden");
    });

    it("should deny access when no user is set (unauthenticated)", async () => {
      const ctx = createContext({});

      await expect(callDocument(ctx)).rejects.toThrow("Forbidden");
    });
  });

  // ============================================================
  // Query: documentOutgoingRelationships
  // ============================================================
  describe("Query: documentOutgoingRelationships", () => {
    const callDocumentOutgoingRelationships = (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)
        ?.documentOutgoingRelationships;
      return query(
        null,
        { sourceIdentifier: "parent-123", relationshipType: "child" },
        ctx,
      );
    };

    it("should allow access when canRead resolves true", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callDocumentOutgoingRelationships(ctx);

      expect(result).toBeDefined();
      expect(mockAuthorizationService.canRead).toHaveBeenCalled();
    });

    it("should deny access when canRead resolves false", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callDocumentOutgoingRelationships(ctx)).rejects.toThrow(
        "Forbidden",
      );
    });
  });

  // ============================================================
  // Query: findDocuments — list-filter behavior
  // ============================================================
  describe("Query: findDocuments", () => {
    const callFindDocuments = (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.findDocuments;
      return query(null, { search: { type: "test/document" } }, ctx);
    };

    it("should return all results without calling canRead when isSupremeAdmin is true", async () => {
      vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(true);
      const ctx = createContext({ userAddress: "0xadmin" });

      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(1);
      expect(mockAuthorizationService.canRead).not.toHaveBeenCalled();
    });

    it("should filter results through canRead when isSupremeAdmin is false and canRead resolves true", async () => {
      vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
        false,
      );
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(1);
      expect(mockAuthorizationService.canRead).toHaveBeenCalled();
    });

    it("should return empty results when isSupremeAdmin is false and canRead resolves false", async () => {
      vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
        false,
      );
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
      const ctx = createContext({ userAddress: "0xunpermitted" });

      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(0);
      expect(mockAuthorizationService.canRead).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Mutation: createDocument
  // ============================================================
  describe("Mutation: createDocument", () => {
    const callCreateDocument = (ctx: any, parentIdentifier?: string) => {
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.createDocument;
      return mutation(
        null,
        {
          document: { documentType: "test/document", state: {} },
          parentIdentifier,
        },
        ctx,
      );
    };

    // Helper: permission passed when the error (if any) is NOT "Forbidden"
    const expectPermissionPassed = async (promise: Promise<any>) => {
      try {
        await promise;
      } catch (error: any) {
        expect(error.message).not.toContain("Forbidden");
      }
    };

    describe("Without Parent (assertCanCreate path)", () => {
      it("should allow when user address is set and policy is DOCUMENT_PERMISSIONS", async () => {
        const ctx = createContext({ userAddress: "0xpermitted" });

        // policy=DOCUMENT_PERMISSIONS + address set → assertCanCreate passes
        await expectPermissionPassed(callCreateDocument(ctx));
      });

      it("should deny when no user address and policy is DOCUMENT_PERMISSIONS", async () => {
        const ctx = createContext({});

        await expect(callCreateDocument(ctx)).rejects.toThrow("Forbidden");
      });

      it("should allow for any user when policy is OPEN", async () => {
        const openSubgraph = buildSubgraph({
          ...mockAuthorizationService,
          config: {
            admins: [],
            defaultProtection: false,
            policy: AuthorizationPolicy.OPEN,
          },
          canCreate: vi.fn().mockReturnValue(true),
        });
        const mutation = (openSubgraph.resolvers.Mutation as any)
          ?.createDocument;
        const ctx = createContext({});

        await expectPermissionPassed(
          mutation(
            null,
            { document: { documentType: "test/document", state: {} } },
            ctx,
          ),
        );
      });

      it("should allow when canCreate allows regardless of user address", async () => {
        vi.mocked(mockAuthorizationService.canCreate!).mockReturnValue(true);
        const ctx = createContext({});

        await expectPermissionPassed(callCreateDocument(ctx));
      });

      it("should deny for non-admin when policy is ADMIN_ONLY", async () => {
        const adminOnlySubgraph = buildSubgraph({
          ...mockAuthorizationService,
          config: {
            admins: [],
            defaultProtection: false,
            policy: AuthorizationPolicy.ADMIN_ONLY,
          },
          isSupremeAdmin: vi.fn().mockReturnValue(false),
          canCreate: vi.fn().mockReturnValue(false),
        });
        const mutation = (adminOnlySubgraph.resolvers.Mutation as any)
          ?.createDocument;
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(
          mutation(
            null,
            { document: { documentType: "test/document", state: {} } },
            ctx,
          ),
        ).rejects.toThrow("Forbidden");
      });
    });

    describe("With Parent (assertCanWrite path)", () => {
      it("should allow when canWrite resolves true on parent", async () => {
        vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xpermitted" });

        await expectPermissionPassed(callCreateDocument(ctx, "parent-123"));
        expect(mockAuthorizationService.canWrite).toHaveBeenCalled();
      });

      it("should deny when canWrite resolves false on parent", async () => {
        vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callCreateDocument(ctx, "parent-123")).rejects.toThrow(
          "Forbidden",
        );
      });
    });
  });

  // ============================================================
  // Mutation: mutateDocument — drives via canMutate
  // ============================================================
  describe("Mutation: mutateDocument", () => {
    const callMutateDocument = (ctx: any, actions: any[] = []) => {
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.mutateDocument;
      return mutation(null, { documentIdentifier: "doc-123", actions }, ctx);
    };

    const expectPermissionPassed = async (promise: Promise<any>) => {
      try {
        await promise;
      } catch (error: any) {
        expect(error.message).not.toContain("Forbidden");
      }
    };

    it("should pass through when actions is empty (no canMutate calls)", async () => {
      const ctx = createContext({ userAddress: "0xpermitted" });

      // No actions → assertCanExecuteOperations never calls canMutate → no throw
      await expectPermissionPassed(callMutateDocument(ctx, []));
      expect(mockAuthorizationService.canMutate).not.toHaveBeenCalled();
    });

    it("should allow when canMutate resolves true for each action", async () => {
      vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await expectPermissionPassed(
        callMutateDocument(ctx, [{ type: "SET_NAME", input: {} }]),
      );
      expect(mockAuthorizationService.canMutate).toHaveBeenCalled();
    });

    it("should deny when canMutate resolves false for an action", async () => {
      vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(false);
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(
        callMutateDocument(ctx, [{ type: "SET_NAME", input: {} }]),
      ).rejects.toThrow("Forbidden");
    });
  });

  // ============================================================
  // Mutation: deleteDocument — drives via canWrite
  // ============================================================
  describe("Mutation: deleteDocument", () => {
    const callDeleteDocument = (ctx: any) => {
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.deleteDocument;
      return mutation(null, { identifier: "doc-123" }, ctx);
    };

    it("should allow when canWrite resolves true", async () => {
      vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callDeleteDocument(ctx);

      expect(result).toBe(true);
      expect(mockAuthorizationService.canWrite).toHaveBeenCalled();
    });

    it("should deny when canWrite resolves false", async () => {
      vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(false);
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callDeleteDocument(ctx)).rejects.toThrow("Forbidden");
    });
  });

  // ============================================================
  // Mutation: moveRelationship — assertCanWrite on both parents
  // ============================================================
  describe("Mutation: moveRelationship", () => {
    const callMoveRelationship = (ctx: any) => {
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.moveRelationship;
      return mutation(
        null,
        {
          sourceParentIdentifier: "parent-123",
          targetParentIdentifier: "parent-456",
          targetIdentifier: "doc-123",
          relationshipType: "child",
        },
        ctx,
      );
    };

    it("should allow when canWrite resolves true for both parents", async () => {
      vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callMoveRelationship(ctx);

      expect(result).toBeDefined();
      // Called twice: once per parent
      expect(mockAuthorizationService.canWrite).toHaveBeenCalledTimes(2);
    });

    it("should deny when canWrite resolves false on source parent", async () => {
      vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValueOnce(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callMoveRelationship(ctx)).rejects.toThrow("Forbidden");
    });

    it("should deny when canWrite resolves false on target parent", async () => {
      vi.mocked(mockAuthorizationService.canWrite!)
        .mockResolvedValueOnce(true) // source parent
        .mockResolvedValueOnce(false); // target parent
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callMoveRelationship(ctx)).rejects.toThrow("Forbidden");
    });
  });

  // ============================================================
  // Mutation: touchChannel — read access to the collection's drive (S-H1)
  // ============================================================
  describe("Mutation: touchChannel", () => {
    const COLLECTION_ID = DriveCollectionId.forDrive("drive-1").key;

    const makeSyncManager = () => ({
      getById: vi.fn(() => {
        throw new Error("not found");
      }),
      add: vi.fn().mockResolvedValue(undefined),
    });

    const touchArgs = (documentIds: string[] = []) => ({
      input: {
        id: "channel-1",
        name: "remote-1",
        collectionId: COLLECTION_ID,
        filter: { documentId: documentIds, scope: [], branch: "main" },
        sinceTimestampUtcMs: "0",
      },
    });

    const callTouchChannel = (
      subgraph: ReactorSubgraph,
      ctx: any,
      documentIds: string[] = [],
    ) => {
      const mutation = (subgraph.resolvers.Mutation as any)?.touchChannel;
      return mutation(null, touchArgs(documentIds), ctx);
    };

    it("should deny anonymous callers who cannot read the drive", async () => {
      const syncManager = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({});

      await expect(callTouchChannel(subgraph, ctx)).rejects.toThrow(
        "Forbidden",
      );
      expect(syncManager.add).not.toHaveBeenCalled();
    });

    it("should deny when the caller cannot read the collection's drive", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
      const syncManager = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callTouchChannel(subgraph, ctx)).rejects.toThrow(
        "Forbidden",
      );
      expect(syncManager.add).not.toHaveBeenCalled();
    });

    it("should gate on the drive id parsed from the collection id, not the filter", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const syncManager = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callTouchChannel(subgraph, ctx, ["doc-1", "doc-2"]);

      expect(result).toEqual({ success: true, ackOrdinal: 0 });
      expect(mockAuthorizationService.canRead).toHaveBeenCalledWith(
        "drive-1",
        "0xpermitted",
      );
      // Registration is a read operation on the drive; per-operation writes are
      // authorized in pushSyncEnvelopes, not here.
      expect(mockAuthorizationService.canWrite).not.toHaveBeenCalled();
      expect(syncManager.add).toHaveBeenCalledOnce();
    });

    it("should allow supreme admins without a drive check", async () => {
      vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(true);
      const syncManager = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({ userAddress: "0xadmin" });

      const result = await callTouchChannel(subgraph, ctx);

      expect(result).toEqual({ success: true, ackOrdinal: 0 });
      expect(mockAuthorizationService.canRead).not.toHaveBeenCalled();
      expect(syncManager.add).toHaveBeenCalledOnce();
    });
  });

  // ============================================================
  // Query: pollSyncEnvelopes — drive read gate + per-document exclusion (S-H1)
  // ============================================================
  describe("Query: pollSyncEnvelopes", () => {
    const makeOutboxSyncOp = (documentId: string, ordinal: number) => ({
      documentId,
      jobId: `job-${documentId}-${ordinal}`,
      jobDependencies: [] as string[],
      branch: "main",
      scopes: ["global"],
      emittedCount: 0,
      deliveredCount: 0,
      operations: [
        {
          operation: {
            id: `op-${documentId}-${ordinal}`,
            index: 0,
            skip: 0,
            hash: `hash-${ordinal}`,
            timestampUtcMs: "0",
            action: {
              id: `action-${ordinal}`,
              type: "SET_NAME",
              input: {},
              scope: "global",
              timestampUtcMs: "0",
            },
          },
          context: {
            documentId,
            documentType: "test/document",
            scope: "global",
            branch: "main",
            ordinal,
          },
        },
      ],
      executed: vi.fn(),
    });

    const makeDeadLetter = (documentId: string) => ({
      documentId,
      error: new Error("boom"),
      jobId: `dl-${documentId}`,
      branch: "main",
      scopes: ["global"],
      operations: [{}],
    });

    const makeSyncManager = (
      driveId: string,
      outbox: ReturnType<typeof makeOutboxSyncOp>[] = [],
      deadLetter: ReturnType<typeof makeDeadLetter>[] = [],
    ) => ({
      getById: vi.fn().mockReturnValue({
        meta: {
          name: "remote-1",
          collectionId: DriveCollectionId.forDrive(driveId),
        },
        channel: {
          inbox: { ackOrdinal: 0 },
          outbox: { items: outbox, remove: vi.fn() },
          deadLetter: { items: deadLetter },
        },
      }),
    });

    const callPoll = (subgraph: ReactorSubgraph, ctx: any) => {
      const query = (subgraph.resolvers.Query as any)?.pollSyncEnvelopes;
      return query(
        null,
        { channelId: "channel-1", outboxAck: 0, outboxLatest: 0 },
        ctx,
      );
    };

    const deliveredDocIds = (result: any): string[] =>
      result.envelopes.flatMap((e: any) =>
        e.operations.map((o: any) => o.context.documentId),
      );

    it("returns envelopes for supreme admins without any read check", async () => {
      vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(true);
      const syncManager = makeSyncManager("drive-1", [
        makeOutboxSyncOp("doc-1", 1),
      ]);
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);

      const result = await callPoll(
        subgraph,
        createContext({ userAddress: "0xadmin" }),
      );

      expect(deliveredDocIds(result)).toEqual(["doc-1"]);
      expect(mockAuthorizationService.canRead).not.toHaveBeenCalled();
    });

    it("denies callers who cannot read the collection's drive", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
      const syncManager = makeSyncManager("drive-1", [
        makeOutboxSyncOp("doc-1", 1),
      ]);
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);

      await expect(
        callPoll(subgraph, createContext({ userAddress: "0xno" })),
      ).rejects.toThrow("Forbidden");
    });

    it("denies anonymous callers", async () => {
      const syncManager = makeSyncManager("drive-1", [
        makeOutboxSyncOp("doc-1", 1),
      ]);
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);

      await expect(callPoll(subgraph, createContext({}))).rejects.toThrow(
        "Forbidden",
      );
    });

    it("throws Channel not found for an unknown channel", async () => {
      const syncManager = {
        getById: vi.fn(() => {
          throw new Error("nope");
        }),
      };
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);

      await expect(
        callPoll(subgraph, createContext({ userAddress: "0xx" })),
      ).rejects.toThrow("Channel not found");
    });

    it("delivers all members when the drive is not world-readable (inheriting grant)", async () => {
      // Tier 1 passes for the caller; the drive is not anonymously readable, so
      // the caller's drive grant inherits to every member: no per-member checks.
      vi.mocked(mockAuthorizationService.canRead!).mockImplementation(
        (_documentId: string, address?: string) =>
          Promise.resolve(address !== undefined),
      );
      const syncManager = makeSyncManager("drive-1", [
        makeOutboxSyncOp("doc-1", 1),
        makeOutboxSyncOp("doc-2", 2),
      ]);
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);

      const result = await callPoll(
        subgraph,
        createContext({ userAddress: "0xowner" }),
      );

      expect(deliveredDocIds(result).sort()).toEqual(["doc-1", "doc-2"]);
      // Only the Tier 1 gate and the world-readable probe ran, not per member.
      expect(mockAuthorizationService.canRead).toHaveBeenCalledTimes(2);
    });

    it("excludes individually-unreadable members on a world-readable drive", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockImplementation(
        (documentId: string) => Promise.resolve(documentId !== "doc-2"),
      );
      const syncManager = makeSyncManager("drive-1", [
        makeOutboxSyncOp("doc-1", 1),
        makeOutboxSyncOp("doc-2", 2),
      ]);
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);

      const result = await callPoll(
        subgraph,
        createContext({ userAddress: "0xreader" }),
      );

      const delivered = deliveredDocIds(result);
      expect(delivered).toContain("doc-1");
      expect(delivered).not.toContain("doc-2");
    });

    it("filters dead letters for documents the caller cannot read", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockImplementation(
        (documentId: string) => Promise.resolve(documentId !== "doc-secret"),
      );
      const syncManager = makeSyncManager(
        "drive-1",
        [],
        [makeDeadLetter("doc-1"), makeDeadLetter("doc-secret")],
      );
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);

      const result = await callPoll(
        subgraph,
        createContext({ userAddress: "0xreader" }),
      );

      const dlDocs = result.deadLetters.map((d: any) => d.documentId);
      expect(dlDocs).toContain("doc-1");
      expect(dlDocs).not.toContain("doc-secret");
    });
  });

  // ============================================================
  // Mutation: pushSyncEnvelopes — canMutate per (document, action type) (S-C2)
  // ============================================================
  describe("Mutation: pushSyncEnvelopes", () => {
    const makeSyncManager = () => {
      const inboxAdd = vi.fn();
      const syncManager = {
        getById: vi.fn().mockReturnValue({
          meta: { name: "remote-1" },
          channel: { inbox: { add: inboxAdd } },
        }),
      };
      return { syncManager, inboxAdd };
    };

    const operationFor = (documentId: string, type: string, ordinal = 0) => ({
      operation: {
        action: {
          id: `action-${ordinal}`,
          type,
          timestampUtcMs: "0",
          input: {},
          scope: "global",
        },
        hash: "hash",
        index: ordinal,
        skip: 0,
        timestampUtcMs: "0",
      },
      context: {
        documentId,
        documentType: "test/document",
        scope: "global",
        branch: "main",
        ordinal,
      },
    });

    const pushArgs = (
      operations: ReturnType<typeof operationFor>[] | null,
    ) => ({
      envelopes: [
        {
          type: "OPERATIONS",
          channelMeta: { id: "channel-1" },
          operations,
          cursor: null,
          key: null,
          dependsOn: null,
        },
      ],
    });

    const callPushSyncEnvelopes = (
      subgraph: ReactorSubgraph,
      ctx: any,
      operations: ReturnType<typeof operationFor>[] | null,
    ) => {
      const mutation = (subgraph.resolvers.Mutation as any)?.pushSyncEnvelopes;
      return mutation(null, pushArgs(operations), ctx);
    };

    it("should deny anonymous callers when canMutate resolves false", async () => {
      const { syncManager, inboxAdd } = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({});

      await expect(
        callPushSyncEnvelopes(subgraph, ctx, [
          operationFor("doc-123", "SET_NAME"),
        ]),
      ).rejects.toThrow("Forbidden");
      expect(inboxAdd).not.toHaveBeenCalled();
    });

    it("should check canMutate against each operation's own document and action type", async () => {
      vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
      const { syncManager, inboxAdd } = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callPushSyncEnvelopes(subgraph, ctx, [
        operationFor("doc-123", "SET_NAME", 0),
        operationFor("doc-456", "DELETE_NODE", 1),
      ]);

      expect(result).toBe(true);
      expect(mockAuthorizationService.canMutate).toHaveBeenCalledWith(
        "doc-123",
        "SET_NAME",
        "0xpermitted",
      );
      expect(mockAuthorizationService.canMutate).toHaveBeenCalledWith(
        "doc-456",
        "DELETE_NODE",
        "0xpermitted",
      );
      expect(inboxAdd).toHaveBeenCalled();
    });

    it("should deny when canMutate resolves false for any pushed operation", async () => {
      vi.mocked(mockAuthorizationService.canMutate!)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const { syncManager, inboxAdd } = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(
        callPushSyncEnvelopes(subgraph, ctx, [
          operationFor("doc-123", "SET_NAME", 0),
          operationFor("doc-456", "DELETE_NODE", 1),
        ]),
      ).rejects.toThrow("Forbidden");
      expect(inboxAdd).not.toHaveBeenCalled();
    });

    it("should check each distinct (document, action type) pair once", async () => {
      vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
      const { syncManager } = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await callPushSyncEnvelopes(subgraph, ctx, [
        operationFor("doc-123", "SET_NAME", 0),
        operationFor("doc-123", "SET_NAME", 1),
        operationFor("doc-123", "DELETE_NODE", 2),
      ]);

      expect(mockAuthorizationService.canMutate).toHaveBeenCalledTimes(2);
    });

    it("should pass envelopes without operations through without permission checks", async () => {
      const { syncManager } = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({});

      const result = await callPushSyncEnvelopes(subgraph, ctx, null);

      expect(result).toBe(true);
      expect(mockAuthorizationService.canMutate).not.toHaveBeenCalled();
    });

    it("should not let a forged (document, action type) pair collide and skip a check", async () => {
      // A space-joined key would let ("doc-x", "OP doc-y") and ("doc-x OP",
      // "doc-y") collide; each distinct pair must be authorized on its own.
      vi.mocked(mockAuthorizationService.canMutate!).mockImplementation(
        (documentId: string) => Promise.resolve(documentId === "doc-x"),
      );
      const { syncManager, inboxAdd } = makeSyncManager();
      const subgraph = buildSubgraph(mockAuthorizationService, syncManager);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await expect(
        callPushSyncEnvelopes(subgraph, ctx, [
          operationFor("doc-x", "OP doc-y", 0),
          operationFor("doc-x OP", "doc-y", 1),
        ]),
      ).rejects.toThrow("Forbidden");
      expect(mockAuthorizationService.canMutate).toHaveBeenCalledWith(
        "doc-x OP",
        "doc-y",
        "0xpermitted",
      );
      expect(inboxAdd).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // OPEN policy — all access allowed for anyone
  // ============================================================
  describe("OPEN policy behavior", () => {
    let openSubgraph: ReactorSubgraph;

    beforeEach(() => {
      const openAuthSvc: Partial<IAuthorizationService> = {
        config: {
          admins: [],
          defaultProtection: false,
          policy: AuthorizationPolicy.OPEN,
        },
        isSupremeAdmin: vi.fn().mockReturnValue(true),
        canCreate: vi.fn().mockReturnValue(true),
        canRead: vi.fn().mockResolvedValue(true),
        canWrite: vi.fn().mockResolvedValue(true),
        canManage: vi.fn().mockResolvedValue(true),
        canMutate: vi.fn().mockResolvedValue(true),
      };
      openSubgraph = buildSubgraph(openAuthSvc);
    });

    it("should allow document reads for any user (including anonymous)", async () => {
      const ctx = createContext({});
      const query = (openSubgraph.resolvers.Query as any)?.document;

      const result = await query(null, { identifier: "doc-123" }, ctx);

      expect(result).toBeDefined();
    });

    it("should allow mutations for any user (including anonymous)", async () => {
      const ctx = createContext({});
      const mutation = (openSubgraph.resolvers.Mutation as any)?.deleteDocument;

      const result = await mutation(null, { identifier: "doc-123" }, ctx);

      expect(result).toBe(true);
    });

    it("should return all findDocuments items without per-item filtering", async () => {
      const ctx = createContext({});
      const query = (openSubgraph.resolvers.Query as any)?.findDocuments;

      const result = await query(null, { search: {} }, ctx);

      expect(result.items).toHaveLength(1);
    });
  });

  // ============================================================
  // Permission Inheritance
  // ============================================================
  describe("Permission Inheritance", () => {
    it("should allow access to child when canRead resolves true (hierarchy check)", async () => {
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      const result = await query(null, { identifier: "child-doc" }, ctx);

      expect(result).toBeDefined();
      expect(mockAuthorizationService.canRead).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Edge Cases
  // ============================================================
  describe("Edge Cases", () => {
    it("should handle document not found gracefully", async () => {
      vi.mocked(mockReactorClient.get!).mockResolvedValue(null as any);
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xadmin" });

      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      // Should throw an error (not Forbidden, but a processing error)
      await expect(
        query(null, { identifier: "non-existent" }, ctx),
      ).rejects.toThrow();
    });

    it("should throw error when document is null in result", async () => {
      vi.mocked(mockReactorClient.get!).mockResolvedValue(
        null as unknown as PHDocument,
      );
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xadmin" });

      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      // The resolver throws when trying to convert null document to GraphQL
      await expect(
        query(null, { identifier: "non-existent" }, ctx),
      ).rejects.toThrow();
    });

    it("should handle unauthenticated user (no user address) — canRead false → Forbidden", async () => {
      const ctx = createContext({});

      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      await expect(query(null, { identifier: "doc-123" }, ctx)).rejects.toThrow(
        "Forbidden",
      );
    });
  });

  // ============================================================
  // S-C1: a slug must be resolved to its canonical id before the
  // per-document authorization check, so the decision layer and the
  // data layer agree on the subject.
  // ============================================================
  describe("S-C1: slug addressing is resolved before the auth check", () => {
    it("checks the canonical id (not the slug) when reading by slug", async () => {
      vi.mocked(mockReactorClient.resolveIdOrSlug!).mockResolvedValue(
        "doc-123",
      );
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
      const ctx = createContext({ userAddress: "0xnonowner" });
      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      await expect(query(null, { identifier: "my-slug" }, ctx)).rejects.toThrow(
        "Forbidden",
      );

      expect(mockReactorClient.resolveIdOrSlug).toHaveBeenCalledWith("my-slug");
      expect(mockAuthorizationService.canRead).toHaveBeenCalledWith(
        "doc-123",
        "0xnonowner",
      );
      expect(mockAuthorizationService.canRead).not.toHaveBeenCalledWith(
        "my-slug",
        expect.anything(),
      );
    });

    it("allows a slug-addressed read when the canonical id is authorized", async () => {
      vi.mocked(mockReactorClient.resolveIdOrSlug!).mockResolvedValue(
        "doc-123",
      );
      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xowner" });
      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      const result = await query(null, { identifier: "my-slug" }, ctx);

      expect(result).toBeDefined();
      expect(mockAuthorizationService.canRead).toHaveBeenCalledWith(
        "doc-123",
        "0xowner",
      );
    });

    it("denies a slug-addressed mutation when the canonical id lacks the grant", async () => {
      vi.mocked(mockReactorClient.resolveIdOrSlug!).mockResolvedValue(
        "doc-123",
      );
      vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(false);
      const ctx = createContext({ userAddress: "0xattacker" });
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.mutateDocument;

      await expect(
        mutation(
          null,
          { documentIdentifier: "my-slug", actions: [{ type: "SET_NAME" }] },
          ctx,
        ),
      ).rejects.toThrow("Forbidden");

      expect(mockAuthorizationService.canMutate).toHaveBeenCalledWith(
        "doc-123",
        "SET_NAME",
        "0xattacker",
      );
    });

    it("returns Forbidden (not a not-found error) for an unresolvable identifier", async () => {
      vi.mocked(mockReactorClient.resolveIdOrSlug!).mockRejectedValue(
        new Error("Document not found: ghost"),
      );
      const ctx = createContext({ userAddress: "0xuser" });
      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      const error = await query(null, { identifier: "ghost" }, ctx).catch(
        (e: Error) => e,
      );

      expect(error.message).toContain("Forbidden");
      expect(error.message).not.toContain("Document not found");
      expect(mockAuthorizationService.canRead).not.toHaveBeenCalled();
    });

    it("passes the canonical id to the delete data path, not the slug", async () => {
      vi.mocked(mockReactorClient.resolveIdOrSlug!).mockResolvedValue(
        "doc-123",
      );
      vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xwriter" });
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.deleteDocument;

      await mutation(null, { identifier: "my-slug" }, ctx);

      expect(mockAuthorizationService.canWrite).toHaveBeenCalledWith(
        "doc-123",
        "0xwriter",
      );
      // #resolveDriveId resolves the drive via the canonical id, proving the
      // data path no longer sees the raw slug.
      expect(mockReactorClient.get).toHaveBeenCalledWith("doc-123");
    });

    it("resolves each distinct identifier once across a batch (per-request memo)", async () => {
      vi.mocked(mockReactorClient.resolveIdOrSlug!).mockImplementation(
        (identifier: string) =>
          Promise.resolve(identifier === "slug-a" ? "uuid-a" : "uuid-b"),
      );
      vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xwriter" });
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.deleteDocuments;

      await mutation(
        null,
        { identifiers: ["slug-a", "slug-a", "slug-b"] },
        ctx,
      );

      const calls = vi
        .mocked(mockReactorClient.resolveIdOrSlug!)
        .mock.calls.map(([id]) => id);
      expect(calls.filter((id) => id === "slug-a")).toHaveLength(1);
      expect(calls.filter((id) => id === "slug-b")).toHaveLength(1);
    });

    it("resolves source and target independently in moveRelationship", async () => {
      vi.mocked(mockReactorClient.resolveIdOrSlug!).mockImplementation(
        (identifier: string) =>
          Promise.resolve(
            identifier === "source-slug" ? "source-uuid" : "target-uuid",
          ),
      );
      vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xwriter" });
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.moveRelationship;

      await mutation(
        null,
        {
          sourceParentIdentifier: "source-slug",
          targetParentIdentifier: "target-slug",
        },
        ctx,
      );

      expect(mockAuthorizationService.canWrite).toHaveBeenCalledWith(
        "source-uuid",
        "0xwriter",
      );
      expect(mockAuthorizationService.canWrite).toHaveBeenCalledWith(
        "target-uuid",
        "0xwriter",
      );
    });

    it("does not resolve slugs under OPEN policy (supreme-admin bypass)", async () => {
      const openAuthSvc: Partial<IAuthorizationService> = {
        config: {
          admins: [],
          defaultProtection: false,
          policy: AuthorizationPolicy.OPEN,
        },
        isSupremeAdmin: vi.fn().mockReturnValue(true),
        canRead: vi.fn().mockResolvedValue(true),
      };
      const openSubgraph = buildSubgraph(openAuthSvc);
      const ctx = createContext({ userAddress: "0xanyone" });
      const query = (openSubgraph.resolvers.Query as any)?.document;

      await query(null, { identifier: "any-slug" }, ctx);

      expect(mockReactorClient.resolveIdOrSlug).not.toHaveBeenCalled();
    });
  });
});
