import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type { PHDocument } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";

describe("ReactorSubgraph Permission Checks", () => {
  let mockDocumentPermissionService: Partial<DocumentPermissionService>;
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
      attachments: {},
      clipboard: [],
    }) as unknown as PHDocument;

  const mockDocument = createMockDocument("doc-123", "Test Document");
  const mockParentDocument = createMockDocument(
    "parent-123",
    "Parent Document",
  );

  // Helper to create context with different permission levels
  const createContext = (options: {
    isAdmin?: boolean;
    isUser?: boolean;
    isGuest?: boolean;
    userAddress?: string;
  }) => ({
    user: options.userAddress ? { address: options.userAddress } : undefined,
    isAdmin: () => options.isAdmin ?? false,
    isUser: () => options.isUser ?? false,
    isGuest: () => options.isGuest ?? false,
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock DocumentPermissionService
    mockDocumentPermissionService = {
      canReadDocument: vi.fn().mockResolvedValue(false),
      canWriteDocument: vi.fn().mockResolvedValue(false),
      canRead: vi.fn().mockResolvedValue(false),
      canWrite: vi.fn().mockResolvedValue(false),
    };

    // Create mock ReactorClient
    // Note: get() returns PHDocument directly
    mockReactorClient = {
      get: vi.fn().mockResolvedValue(mockDocument),
      getChildren: vi.fn().mockResolvedValue({
        results: [],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      getParents: vi.fn().mockResolvedValue({
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
      addChildren: vi.fn().mockResolvedValue(mockParentDocument),
      removeChildren: vi.fn().mockResolvedValue(mockParentDocument),
      moveChildren: vi.fn().mockResolvedValue({
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

    reactorSubgraph = new ReactorSubgraph({
      reactorClient: mockReactorClient as IReactorClient,
      documentPermissionService:
        mockDocumentPermissionService as DocumentPermissionService,
      reactor: {} as any,
      relationalDb: {} as any,
      analyticsStore: {} as any,
      graphqlManager: {} as any,
    } as SubgraphArgs);
  });

  describe("Query: document", () => {
    const callDocument = async (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      return query(null, { identifier: "doc-123" }, ctx);
    };

    describe("Global Role Access", () => {
      it("should allow access when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callDocument(ctx);

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callDocument(ctx);

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when user is global guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await callDocument(ctx);

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });
    });

    describe("Document Permission Access", () => {
      it("should allow access when user has document read permission", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callDocument(ctx);

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).toHaveBeenCalled();
      });

      it("should deny access when user has no permissions", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callDocument(ctx)).rejects.toThrow("Forbidden");
      });
    });
  });

  describe("Query: documentChildren", () => {
    const callDocumentChildren = async (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.documentChildren;
      return query(null, { parentIdentifier: "parent-123" }, ctx);
    };

    it("should allow access when user is global admin", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await callDocumentChildren(ctx);

      expect(result).toBeDefined();
    });

    it("should check permission on parent document", async () => {
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await callDocumentChildren(ctx);

      expect(mockDocumentPermissionService.canRead).toHaveBeenCalled();
    });

    it("should deny access when user cannot read parent", async () => {
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callDocumentChildren(ctx)).rejects.toThrow("Forbidden");
    });
  });

  describe("Query: findDocuments", () => {
    const callFindDocuments = async (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.findDocuments;
      return query(null, { search: { type: "test/document" } }, ctx);
    };

    it("should return all results for global admin", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(1);
      expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
    });

    it("should filter results based on permissions when no global access", async () => {
      // First document: user has permission
      // Setup: canRead returns true for first call
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(1);
      expect(mockDocumentPermissionService.canRead).toHaveBeenCalled();
    });

    it("should return empty results when user has no permissions", async () => {
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(0);
    });
  });

  describe("Mutation: createDocument", () => {
    const callCreateDocument = async (ctx: any, parentIdentifier?: string) => {
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

    // Helper to verify permission passed (may fail later validation, but NOT due to "Forbidden")
    const expectPermissionPassed = async (promise: Promise<any>) => {
      try {
        await promise;
      } catch (error: any) {
        // If we get here, make sure it's NOT a permission error
        expect(error.message).not.toContain("Forbidden");
      }
    };

    describe("Without Parent", () => {
      it("should allow when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        // Permission check passes, may fail later validation
        await expectPermissionPassed(callCreateDocument(ctx));
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });

      it("should allow when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        // Permission check passes, may fail later validation
        await expectPermissionPassed(callCreateDocument(ctx));
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });

      it("should deny when user is only guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        await expect(callCreateDocument(ctx)).rejects.toThrow("Forbidden");
      });

      it("should deny when no global access", async () => {
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callCreateDocument(ctx)).rejects.toThrow("Forbidden");
      });
    });

    describe("With Parent", () => {
      it("should check write permission on parent", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xpermitted" });

        // Permission check passes, may fail later validation
        await expectPermissionPassed(callCreateDocument(ctx, "parent-123"));
        expect(mockDocumentPermissionService.canWrite).toHaveBeenCalled();
      });

      it("should deny when user cannot write to parent", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callCreateDocument(ctx, "parent-123")).rejects.toThrow(
          "Forbidden",
        );
      });
    });
  });

  describe("Mutation: mutateDocument", () => {
    const callMutateDocument = async (ctx: any) => {
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.mutateDocument;
      return mutation(
        null,
        { documentIdentifier: "doc-123", actions: [] },
        ctx,
      );
    };

    // Helper to verify permission passed (may fail later validation, but NOT due to "Forbidden")
    const expectPermissionPassed = async (promise: Promise<any>) => {
      try {
        await promise;
      } catch (error: any) {
        // If we get here, make sure it's NOT a permission error
        expect(error.message).not.toContain("Forbidden");
      }
    };

    it("should allow when user is global admin", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      // Permission check passes, may fail later validation (document model not found)
      await expectPermissionPassed(callMutateDocument(ctx));
      expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
    });

    it("should allow when user has write permission", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      const ctx = createContext({ userAddress: "0xpermitted" });

      // Permission check passes, may fail later validation
      await expectPermissionPassed(callMutateDocument(ctx));
      expect(mockDocumentPermissionService.canWrite).toHaveBeenCalled();
    });

    it("should deny when user has no write permission", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callMutateDocument(ctx)).rejects.toThrow("Forbidden");
    });
  });

  describe("Mutation: deleteDocument", () => {
    const callDeleteDocument = async (ctx: any) => {
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.deleteDocument;
      return mutation(null, { identifier: "doc-123" }, ctx);
    };

    it("should allow when user is global admin", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await callDeleteDocument(ctx);

      expect(result).toBe(true);
    });

    it("should allow when user has write permission", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      const ctx = createContext({ userAddress: "0xpermitted" });

      const result = await callDeleteDocument(ctx);

      expect(result).toBe(true);
    });

    it("should deny when user has no write permission", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callDeleteDocument(ctx)).rejects.toThrow("Forbidden");
    });
  });

  describe("Mutation: moveChildren", () => {
    const callMoveChildren = async (ctx: any) => {
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.moveChildren;
      return mutation(
        null,
        {
          sourceParentIdentifier: "parent-123",
          targetParentIdentifier: "parent-456",
          documentIdentifiers: ["doc-123"],
        },
        ctx,
      );
    };

    it("should allow when user is global admin", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await callMoveChildren(ctx);

      expect(result).toBeDefined();
    });

    it("should check write permission on both parents", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      const ctx = createContext({ userAddress: "0xpermitted" });

      await callMoveChildren(ctx);

      // Should be called twice - once for source, once for target
      expect(mockDocumentPermissionService.canWrite).toHaveBeenCalledTimes(2);
    });

    it("should deny when user cannot write to source parent", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValueOnce(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callMoveChildren(ctx)).rejects.toThrow("Forbidden");
    });

    it("should deny when user cannot write to target parent", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!)
        .mockResolvedValueOnce(true) // source parent
        .mockResolvedValueOnce(false); // target parent
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callMoveChildren(ctx)).rejects.toThrow("Forbidden");
    });
  });

  describe("Permission Inheritance", () => {
    it("should allow access to child when user has permission on parent", async () => {
      // Setup: canRead checks parent hierarchy and finds permission on parent
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      const result = await query(null, { identifier: "child-doc" }, ctx);

      expect(result).toBeDefined();
      // The canRead should be called with getParentIdsFn which handles hierarchy
      expect(mockDocumentPermissionService.canRead).toHaveBeenCalled();
    });
  });

  describe("AUTH_ENABLED=false behavior", () => {
    it("should allow all access when all global roles return true", async () => {
      // When AUTH_ENABLED=false, isAdmin/isUser/isGuest all return true
      const ctx = createContext({
        isAdmin: true,
        isUser: true,
        isGuest: true,
        userAddress: "0xanyone",
      });

      // Test document query - permission check passes
      const docResult = await (
        reactorSubgraph.resolvers.Query as any
      )?.document(null, { identifier: "doc-123" }, ctx);
      expect(docResult).toBeDefined();

      // Test mutation - permission check passes, may fail later validation
      // but should NOT throw "Forbidden"
      try {
        await (reactorSubgraph.resolvers.Mutation as any)?.mutateDocument(
          null,
          { documentIdentifier: "doc-123", actions: [] },
          ctx,
        );
      } catch (error: any) {
        // Ensure it's not a permission error
        expect(error.message).not.toContain("Forbidden");
      }

      // Permission service should never be called (global roles bypass)
      expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle document not found gracefully", async () => {
      // When get() returns null, the resolver throws an error
      vi.mocked(mockReactorClient.get!).mockResolvedValue(null as any);
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      // Should throw an error (not Forbidden, but a processing error)
      await expect(
        query(null, { identifier: "non-existent" }, ctx),
      ).rejects.toThrow();
    });

    it("should throw error when document is null in result", async () => {
      // When get() returns null, resolver throws
      // because it tries to access document.header
      vi.mocked(mockReactorClient.get!).mockResolvedValue(
        null as unknown as PHDocument,
      );
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      // The resolver throws when trying to convert null document to GraphQL
      await expect(
        query(null, { identifier: "non-existent" }, ctx),
      ).rejects.toThrow();
    });

    it("should handle unauthenticated user (no user address)", async () => {
      const ctx = createContext({});

      const query = (reactorSubgraph.resolvers.Query as any)?.document;

      await expect(query(null, { identifier: "doc-123" }, ctx)).rejects.toThrow(
        "Forbidden",
      );
    });
  });
});
