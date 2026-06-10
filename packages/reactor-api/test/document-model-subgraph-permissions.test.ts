import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { GraphQLError } from "graphql";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../src/services/authorization.service.js";

describe("DocumentModelSubgraph Permission Checks", () => {
  let mockAuthorizationService: Partial<IAuthorizationService>;
  let mockReactorClient: Partial<IReactorClient>;
  let subgraph: DocumentModelSubgraph;

  const mockDocumentModel: DocumentModelModule = {
    documentModel: {
      global: {
        id: "powerhouse/test-model",
        name: "Test Model",
        specifications: [
          {
            version: 1,
            changeLog: [],
            modules: [
              {
                name: "Base",
                operations: [
                  { name: "SET_NAME" },
                  { name: "SET_VALUE" },
                  { name: "RESTRICTED_OP" },
                ],
              },
            ],
            state: { global: {}, local: {} },
          },
        ],
      },
    },
    actions: {
      setName: vi.fn((input: unknown) => ({ type: "SET_NAME", input })),
      setValue: vi.fn((input: unknown) => ({ type: "SET_VALUE", input })),
      restrictedOp: vi.fn((input: unknown) => ({
        type: "RESTRICTED_OP",
        input,
      })),
    },
    reducer: vi.fn(),
  } as unknown as DocumentModelModule;

  const createMockDocument = (id: string, name: string): PHDocument =>
    ({
      header: {
        id,
        slug: id,
        name,
        documentType: "powerhouse/test-model",
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

  const createContext = (options: { userAddress?: string }): Context =>
    ({
      user: options.userAddress ? { address: options.userAddress } : undefined,
    }) as unknown as Context;

  /**
   * Build a SubgraphArgs-shaped object with the given authorizationService.
   * We cast to unknown first so TypeScript doesn't complain about the stub fields.
   */
  const buildSubgraphArgs = (
    authSvc: Partial<IAuthorizationService>,
  ): SubgraphArgs =>
    ({
      reactorClient: mockReactorClient as IReactorClient,
      authorizationService: authSvc as IAuthorizationService,
      relationalDb: {} as SubgraphArgs["relationalDb"],
      analyticsStore: {} as SubgraphArgs["analyticsStore"],
      graphqlManager: {} as SubgraphArgs["graphqlManager"],
      syncManager: {} as SubgraphArgs["syncManager"],
    }) as unknown as SubgraphArgs;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: DOCUMENT_PERMISSIONS policy, not a supreme admin, all
    // decisions deny.
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

    mockReactorClient = {
      getIncomingRelationships: vi.fn().mockResolvedValue({
        results: [],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      getOutgoingRelationships: vi.fn().mockResolvedValue({
        results: [],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      get: vi.fn().mockResolvedValue(mockDocument),
      find: vi.fn().mockResolvedValue({
        results: [mockDocument],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      createEmpty: vi.fn().mockResolvedValue(mockDocument),
      execute: vi.fn().mockResolvedValue({
        ...mockDocument,
        header: { ...mockDocument.header, revision: { global: 2 } },
      }),
    };

    subgraph = new DocumentModelSubgraph(
      mockDocumentModel,
      buildSubgraphArgs(mockAuthorizationService),
    );
  });

  // ---------------------------------------------------------------------------
  // Query: document
  // ---------------------------------------------------------------------------

  describe("Query: document", () => {
    const callGetDocument = async (ctx: Context, identifier: string) => {
      const queryResolver = subgraph.queryResolvers.document;
      return queryResolver(null, { identifier }, ctx);
    };

    describe("Global Admin Access", () => {
      it("should allow access when authorizationService.canRead resolves true (supreme admin path)", async () => {
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xadmin" });

        const result = await callGetDocument(ctx, "doc-123");

        expect(result).toBeDefined();
        expect(result.document.id).toBe("doc-123");
        expect(mockAuthorizationService.canRead).toHaveBeenCalled();
      });

      it("should deny access when canRead resolves false even for non-null user", async () => {
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xadmin" });

        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          "Forbidden",
        );
      });
    });

    describe("Document Permission Access", () => {
      it("should allow access when authorizationService.canRead resolves true", async () => {
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callGetDocument(ctx, "doc-123");

        expect(result).toBeDefined();
        expect(mockAuthorizationService.canRead).toHaveBeenCalledWith(
          "doc-123",
          "0xpermitted",
        );
      });

      it("should deny access when authorizationService.canRead resolves false", async () => {
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          GraphQLError,
        );
        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          "Forbidden: insufficient permissions to read this document",
        );
      });

      it("should deny access when user is not authenticated (canRead false for undefined address)", async () => {
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
        const ctx = createContext({});

        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          "Forbidden",
        );
      });
    });

    describe("Document validation", () => {
      it("should throw error when identifier is not provided", async () => {
        const ctx = createContext({ userAddress: "0xadmin" });

        await expect(callGetDocument(ctx, "")).rejects.toThrow(
          "Document identifier is required",
        );
      });

      it("should throw error if document type does not match", async () => {
        const wrongTypeDoc = {
          ...mockDocument,
          header: { ...mockDocument.header, documentType: "other/type" },
        };
        mockReactorClient.get = vi.fn().mockResolvedValue(wrongTypeDoc);
        const ctx = createContext({ userAddress: "0xadmin" });

        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          "is not of type",
        );
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.get to fetch document", async () => {
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xadmin" });

        await callGetDocument(ctx, "doc-123");

        expect(mockReactorClient.get).toHaveBeenCalledWith(
          "doc-123",
          undefined,
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Query: findDocuments
  // ---------------------------------------------------------------------------

  describe("Query: findDocuments", () => {
    const callFindDocuments = async (ctx: Context, parentId?: string) => {
      const queryResolver = subgraph.queryResolvers.findDocuments;
      const result = await queryResolver(
        null,
        { search: { parentId }, paging: { limit: 10 } },
        ctx,
      );
      return result.items;
    };

    describe("Supreme Admin Access (no per-item canRead call)", () => {
      it("should return all documents and skip per-item canRead when isSupremeAdmin=true", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        const result = await callFindDocuments(ctx, "drive-1");

        expect(result).toHaveLength(1);
        expect(mockAuthorizationService.canRead).not.toHaveBeenCalled();
      });
    });

    describe("Document Permission Filtering", () => {
      beforeEach(() => {
        const docs = [
          createMockDocument("doc-1", "Doc 1"),
          createMockDocument("doc-2", "Doc 2"),
          createMockDocument("doc-3", "Doc 3"),
        ];
        mockReactorClient.find = vi.fn().mockResolvedValue({
          results: docs,
          options: { limit: 10, cursor: "" },
        } as PagedResults<PHDocument>);
      });

      it("should filter documents based on canRead when not a supreme admin", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          false,
        );
        vi.mocked(mockAuthorizationService.canRead!).mockImplementation(
          (docId) => Promise.resolve(docId === "doc-1" || docId === "doc-3"),
        );
        const ctx = createContext({ userAddress: "0xpartial" });

        const result = await callFindDocuments(ctx, "drive-1");

        expect(result).toHaveLength(2);
        expect(result.map((d: { id: string }) => d.id).sort()).toEqual([
          "doc-1",
          "doc-3",
        ]);
      });

      it("should return empty array when canRead always resolves false", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          false,
        );
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xnopermissions" });

        const result = await callFindDocuments(ctx, "drive-1");

        expect(result).toHaveLength(0);
      });
    });

    describe("Permission filtering (no user)", () => {
      it("should filter out all documents when user is not authenticated", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          false,
        );
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
        const ctx = createContext({});

        const result = await callFindDocuments(ctx, "drive-1");
        expect(result).toHaveLength(0);
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.find with type filter", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        await callFindDocuments(ctx, "drive-1");

        expect(mockReactorClient.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "powerhouse/test-model",
            parentId: "drive-1",
          }),
          undefined,
          expect.objectContaining({
            limit: 10,
          }),
        );
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Query: documents (get all)
  // ---------------------------------------------------------------------------

  describe("Query: documents (get all)", () => {
    const callDocuments = async (
      ctx: Context,
      paging?: { limit?: number; offset?: number; cursor?: string },
    ) => {
      const queryResolver = subgraph.queryResolvers.documents;
      const result = await queryResolver(null, { paging }, ctx);
      return result;
    };

    describe("Supreme Admin Access", () => {
      it("should return all documents and skip per-item canRead when isSupremeAdmin=true", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        const result = await callDocuments(ctx, { limit: 10 });

        expect(result.items).toHaveLength(1);
        expect(mockAuthorizationService.canRead).not.toHaveBeenCalled();
      });
    });

    describe("Document Permission Filtering", () => {
      beforeEach(() => {
        const docs = [
          createMockDocument("doc-1", "Doc 1"),
          createMockDocument("doc-2", "Doc 2"),
          createMockDocument("doc-3", "Doc 3"),
        ];
        mockReactorClient.find = vi.fn().mockResolvedValue({
          results: docs,
          options: { limit: 10, cursor: "" },
        } as PagedResults<PHDocument>);
      });

      it("should filter documents based on canRead when not a supreme admin", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          false,
        );
        vi.mocked(mockAuthorizationService.canRead!).mockImplementation(
          (docId) => Promise.resolve(docId === "doc-1" || docId === "doc-3"),
        );
        const ctx = createContext({ userAddress: "0xpartial" });

        const result = await callDocuments(ctx, { limit: 10 });

        expect(result.items).toHaveLength(2);
        expect(result.items.map((d) => d.id).sort()).toEqual([
          "doc-1",
          "doc-3",
        ]);
      });

      it("should return empty array when canRead always resolves false", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          false,
        );
        vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xnopermissions" });

        const result = await callDocuments(ctx, { limit: 10 });

        expect(result.items).toHaveLength(0);
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.find with type filter and no parentId", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        await callDocuments(ctx, { limit: 10 });

        expect(mockReactorClient.find).toHaveBeenCalledWith(
          expect.objectContaining({
            type: "powerhouse/test-model",
          }),
          undefined,
          expect.objectContaining({
            limit: 10,
          }),
        );
      });

      it("should work without paging argument", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        const result = await callDocuments(ctx);

        expect(result.items).toHaveLength(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Mutation: createDocument
  // ---------------------------------------------------------------------------

  describe("Mutation: createDocument", () => {
    const callCreateDocument = async (
      ctx: Context,
      name: string,
      parentIdentifier?: string,
    ) => {
      const mutation = subgraph.mutationResolvers.createDocument;
      return mutation(null, { name, parentIdentifier }, ctx);
    };

    describe("Without parentIdentifier — assertCanCreate path", () => {
      it("should allow creation when policy=DOCUMENT_PERMISSIONS and user has an address", async () => {
        // DOCUMENT_PERMISSIONS + non-admin + user address set → allowed
        const ctx = createContext({ userAddress: "0xuser" });

        const result = await callCreateDocument(ctx, "New Doc");

        expect(result).toMatchObject({ id: "doc-123" });
        // canWrite should NOT be called (no parent)
        expect(mockAuthorizationService.canWrite).not.toHaveBeenCalled();
      });

      it("should throw Forbidden when policy=DOCUMENT_PERMISSIONS and no user address", async () => {
        const ctx = createContext({});

        await expect(callCreateDocument(ctx, "New Doc")).rejects.toThrow(
          "Forbidden",
        );
      });

      it("should allow creation when isSupremeAdmin=true regardless of policy", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        const result = await callCreateDocument(ctx, "New Doc");

        expect(result).toMatchObject({ id: "doc-123" });
      });

      it("should throw Forbidden when policy=ADMIN_ONLY and user is not a supreme admin", async () => {
        const adminOnlyAuth: Partial<IAuthorizationService> = {
          ...mockAuthorizationService,
          config: {
            admins: [],
            defaultProtection: false,
            policy: AuthorizationPolicy.ADMIN_ONLY,
          },
          isSupremeAdmin: vi.fn().mockReturnValue(false),
          canCreate: vi.fn().mockReturnValue(false),
        };
        const sg = new DocumentModelSubgraph(
          mockDocumentModel,
          buildSubgraphArgs(adminOnlyAuth),
        );

        const ctx = createContext({ userAddress: "0xuser" });
        await expect(
          sg.mutationResolvers.createDocument(null, { name: "X" }, ctx),
        ).rejects.toThrow(
          "Forbidden: insufficient permissions to create documents",
        );
      });

      it("should allow all when policy=OPEN (no user needed)", async () => {
        const openAuth: Partial<IAuthorizationService> = {
          ...mockAuthorizationService,
          config: {
            admins: [],
            defaultProtection: false,
            policy: AuthorizationPolicy.OPEN,
          },
          isSupremeAdmin: vi.fn().mockReturnValue(true),
          canCreate: vi.fn().mockReturnValue(true),
        };
        const sg = new DocumentModelSubgraph(
          mockDocumentModel,
          buildSubgraphArgs(openAuth),
        );

        // No user at all
        const ctx = createContext({});
        const result = await sg.mutationResolvers.createDocument(
          null,
          { name: "OpenDoc" },
          ctx,
        );
        expect(result).toMatchObject({ id: "doc-123" });
      });
    });

    describe("With parentIdentifier — assertCanWrite path", () => {
      it("should allow creation when canWrite resolves true on parent", async () => {
        vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callCreateDocument(ctx, "New Doc", "drive-1");

        expect(result).toMatchObject({ id: "doc-123" });
        expect(mockAuthorizationService.canWrite).toHaveBeenCalledWith(
          "drive-1",
          "0xpermitted",
        );
      });

      it("should deny creation when canWrite resolves false on parent", async () => {
        vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(
          callCreateDocument(ctx, "New Doc", "drive-1"),
        ).rejects.toThrow("Forbidden");
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.createEmpty with parentIdentifier", async () => {
        vi.mocked(mockAuthorizationService.canWrite!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xadmin" });

        await callCreateDocument(ctx, "New Doc", "drive-1");

        expect(mockReactorClient.createEmpty).toHaveBeenCalledWith(
          "powerhouse/test-model",
          { parentIdentifier: "drive-1" },
        );
      });

      it("should use reactorClient.execute to set name when name differs from created doc", async () => {
        // mockDocument.header.name = "Test Document"; passing "New Doc" triggers SET_NAME
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        await callCreateDocument(ctx, "New Doc");

        expect(mockReactorClient.execute).toHaveBeenCalledWith(
          "doc-123",
          "main",
          [expect.objectContaining({ type: "SET_NAME" })],
        );
      });

      it("should not call execute if name matches created document name", async () => {
        // Make createEmpty return a doc whose name already matches
        const namedDoc = createMockDocument("doc-123", "Same Name");
        mockReactorClient.createEmpty = vi.fn().mockResolvedValue(namedDoc);
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        await callCreateDocument(ctx, "Same Name");

        expect(mockReactorClient.createEmpty).toHaveBeenCalled();
        expect(mockReactorClient.execute).not.toHaveBeenCalled();
      });

      it("should not call execute if name is empty", async () => {
        vi.mocked(mockAuthorizationService.isSupremeAdmin!).mockReturnValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xadmin" });

        await callCreateDocument(ctx, "");

        expect(mockReactorClient.createEmpty).toHaveBeenCalled();
        expect(mockReactorClient.execute).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Mutation: operations (setName, setValue, restrictedOp, etc.)
  // They all go through assertCanExecuteOperation → canMutate
  // ---------------------------------------------------------------------------

  describe("Mutation: operations (setName, setValue, etc.)", () => {
    const callMutation = async (
      ctx: Context,
      operationName: string,
      docId: string,
      input: unknown,
    ) => {
      const mutation = subgraph.mutationResolvers[operationName];
      return await mutation(null, { docId, input }, ctx);
    };

    describe("canMutate delegation", () => {
      it("should delegate to canMutate and allow when it resolves true", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callMutation(ctx, "setName", "doc-123", {
          name: "New Name",
        });

        expect(result).toMatchObject({
          id: "doc-123",
          revisionsList: expect.arrayContaining([
            expect.objectContaining({ scope: "global", revision: 2 }),
          ]) as unknown[],
        });
        expect(mockAuthorizationService.canMutate).toHaveBeenCalledWith(
          "doc-123",
          "SET_NAME",
          "0xpermitted",
        );
      });

      it("should deny operation when canMutate resolves false", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(
          callMutation(ctx, "setName", "doc-123", { name: "New Name" }),
        ).rejects.toThrow("Forbidden");
      });

      it("should deny operation for unauthenticated user when canMutate resolves false", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(false);
        const ctx = createContext({});

        await expect(
          callMutation(ctx, "setName", "doc-123", { name: "New Name" }),
        ).rejects.toThrow("Forbidden");
      });

      it("should deny restricted operation when canMutate resolves false", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunauthorized" });

        await expect(
          callMutation(ctx, "restrictedOp", "doc-123", { value: 42 }),
        ).rejects.toThrow("Forbidden");
      });

      it("should allow restricted operation when canMutate resolves true", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xauthorized" });

        const result = await callMutation(ctx, "restrictedOp", "doc-123", {
          value: 42,
        });

        expect(result).toMatchObject({
          id: "doc-123",
          revisionsList: expect.arrayContaining([
            expect.objectContaining({ scope: "global", revision: 2 }),
          ]) as unknown[],
        });
        expect(mockAuthorizationService.canMutate).toHaveBeenCalledWith(
          "doc-123",
          "RESTRICTED_OP",
          "0xauthorized",
        );
      });

      it("should pass correct operation type name to canMutate", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xuser" });

        await callMutation(ctx, "setValue", "doc-123", { value: 42 });

        expect(mockAuthorizationService.canMutate).toHaveBeenCalledWith(
          "doc-123",
          "SET_VALUE",
          "0xuser",
        );
      });
    });

    describe("Document type validation", () => {
      it("should throw error when document type does not match", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const wrongTypeDoc = {
          ...mockDocument,
          header: { ...mockDocument.header, documentType: "other/type" },
        };
        mockReactorClient.get = vi.fn().mockResolvedValue(wrongTypeDoc);
        const ctx = createContext({ userAddress: "0xpermitted" });

        await expect(
          callMutation(ctx, "setName", "doc-123", { name: "New Name" }),
        ).rejects.toThrow("is not of type");
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.get to verify document", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xadmin" });

        await callMutation(ctx, "setName", "doc-123", { name: "New Name" });

        expect(mockReactorClient.get).toHaveBeenCalledWith("doc-123");
      });

      it("should use reactorClient.execute to apply action", async () => {
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xadmin" });

        await callMutation(ctx, "setName", "doc-123", { name: "New Name" });

        expect(mockReactorClient.execute).toHaveBeenCalledWith(
          "doc-123",
          "main",
          [expect.objectContaining({ type: "SET_NAME" })],
        );
      });

      it("should return PHDocument from updated document", async () => {
        mockReactorClient.execute = vi.fn().mockResolvedValue({
          ...mockDocument,
          header: { ...mockDocument.header, revision: { global: 42 } },
        });
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xadmin" });

        const result = await callMutation(ctx, "setName", "doc-123", {
          name: "New Name",
        });

        expect(result).toMatchObject({
          id: "doc-123",
          revisionsList: expect.arrayContaining([
            expect.objectContaining({ scope: "global", revision: 42 }),
          ]) as unknown[],
        });
      });

      it("should handle execute errors gracefully", async () => {
        mockReactorClient.execute = vi
          .fn()
          .mockRejectedValue(new Error("Execute failed"));
        vi.mocked(mockAuthorizationService.canMutate!).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xadmin" });

        await expect(
          callMutation(ctx, "setName", "doc-123", { name: "New Name" }),
        ).rejects.toThrow("Execute failed");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // OPEN policy — replaces deleted "AUTH_ENABLED=false" and "No Permission
  // Service" describe blocks. With OPEN policy isSupremeAdmin always returns
  // true and all canX return true, so everyone (incl. unauthenticated) can
  // read, write, and mutate.
  // ---------------------------------------------------------------------------

  describe("OPEN policy behavior (auth disabled equivalent)", () => {
    let openSubgraph: DocumentModelSubgraph;

    beforeEach(() => {
      const openAuth: Partial<IAuthorizationService> = {
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
      openSubgraph = new DocumentModelSubgraph(
        mockDocumentModel,
        buildSubgraphArgs(openAuth),
      );
    });

    it("should allow read access for any user (incl. unauthenticated)", async () => {
      const ctx = createContext({});

      const queryResolver = openSubgraph.queryResolvers.document;
      const result = await queryResolver(null, { identifier: "doc-123" }, ctx);

      expect(result).toBeDefined();
    });

    it("should allow read access for authenticated user", async () => {
      const ctx = createContext({ userAddress: "0xanyone" });

      const queryResolver = openSubgraph.queryResolvers.document;
      const result = await queryResolver(null, { identifier: "doc-123" }, ctx);

      expect(result).toBeDefined();
    });

    it("should allow write/mutation for any user (incl. unauthenticated)", async () => {
      const ctx = createContext({});

      const result = await openSubgraph.mutationResolvers.setName(
        null,
        { docId: "doc-123", input: { name: "New" } },
        ctx,
      );

      expect(result).toMatchObject({
        id: "doc-123",
        revisionsList: expect.arrayContaining([
          expect.objectContaining({ scope: "global", revision: 2 }),
        ]) as unknown[],
      });
    });

    it("should return all documents without per-item filtering (isSupremeAdmin=true)", async () => {
      const ctx = createContext({});

      const queryResolver = openSubgraph.queryResolvers.documents;
      const result = await queryResolver(null, { paging: { limit: 10 } }, ctx);

      expect(result.items).toHaveLength(1);
    });

    it("should allow createDocument without user (OPEN policy)", async () => {
      const ctx = createContext({});

      const result = await openSubgraph.mutationResolvers.createDocument(
        null,
        { name: "OpenDoc" },
        ctx,
      );

      expect(result).toMatchObject({ id: "doc-123" });
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe("Edge Cases", () => {
    it("should handle empty user address in context (canRead called with empty string)", async () => {
      const ctx = {
        user: { address: "" },
      } as unknown as Context;

      vi.mocked(mockAuthorizationService.canRead!).mockResolvedValue(false);

      const queryResolver = subgraph.queryResolvers.document;

      await expect(
        queryResolver(null, { identifier: "doc-123" }, ctx),
      ).rejects.toThrow("Forbidden");

      expect(mockAuthorizationService.canRead).toHaveBeenCalledWith(
        "doc-123",
        "",
      );
    });
  });
});
