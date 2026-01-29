/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/unbound-method */
import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type { IDocumentDriveServer } from "document-drive";
import type { DocumentModelModule, PHDocument } from "document-model";
import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentModelSubgraph } from "../src/graphql/document-model-subgraph.js";
import type { Context, SubgraphArgs } from "../src/graphql/types.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";

describe("DocumentModelSubgraph Permission Checks", () => {
  let mockDocumentPermissionService: Partial<DocumentPermissionService>;
  let mockReactor: Partial<IDocumentDriveServer>;
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
      setName: vi.fn((input: any) => ({ type: "SET_NAME", input })),
      setValue: vi.fn((input: any) => ({ type: "SET_VALUE", input })),
      restrictedOp: vi.fn((input: any) => ({ type: "RESTRICTED_OP", input })),
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
      attachments: {},
      clipboard: [],
    }) as unknown as PHDocument;

  const mockDocument = createMockDocument("doc-123", "Test Document");

  const createContext = (options: {
    isAdmin?: boolean;
    isUser?: boolean;
    isGuest?: boolean;
    userAddress?: string;
  }): Context =>
    ({
      user: options.userAddress ? { address: options.userAddress } : undefined,
      isAdmin: vi.fn().mockReturnValue(options.isAdmin ?? false),
      isUser: vi.fn().mockReturnValue(options.isUser ?? false),
      isGuest: vi.fn().mockReturnValue(options.isGuest ?? false),
    }) as unknown as Context;

  beforeEach(() => {
    vi.clearAllMocks();

    delete process.env.FREE_ENTRY;

    mockDocumentPermissionService = {
      canRead: vi.fn().mockResolvedValue(false),
      canWrite: vi.fn().mockResolvedValue(false),
      canReadDocument: vi.fn().mockResolvedValue(false),
      canWriteDocument: vi.fn().mockResolvedValue(false),
      isOperationRestricted: vi.fn().mockResolvedValue(false),
      canExecuteOperation: vi.fn().mockResolvedValue(false),
    };

    mockReactor = {
      getDocument: vi.fn().mockResolvedValue(mockDocument),
      getDocuments: vi.fn().mockResolvedValue(["doc-123"]),
      addDocument: vi.fn().mockResolvedValue(mockDocument),
      addAction: vi.fn().mockResolvedValue({
        status: "SUCCESS",
        operations: [{ index: 1 }],
      }),
    };

    mockReactorClient = {
      getParents: vi.fn().mockResolvedValue({
        results: [],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      get: vi.fn().mockResolvedValue({
        document: mockDocument,
        childIds: [],
      }),
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

    subgraph = new DocumentModelSubgraph(mockDocumentModel, {
      reactor: mockReactor as IDocumentDriveServer,
      reactorClient: mockReactorClient as IReactorClient,
      documentPermissionService:
        mockDocumentPermissionService as DocumentPermissionService,
      relationalDb: {} as any,
      graphqlManager: {} as any,
      syncManager: {} as any,
    } as SubgraphArgs);
  });

  afterEach(() => {
    delete process.env.FREE_ENTRY;
  });

  describe("Query: getDocument", () => {
    const callGetDocument = async (
      ctx: Context,
      docId: string,
      driveId?: string,
    ) => {
      const queryResolver = (subgraph.resolvers.Query as any)?.TestModel;
      const queryObject = queryResolver(null, {}, ctx);
      return queryObject.getDocument({ docId, driveId });
    };

    describe("Global Role Access (hasGlobalReadAccess)", () => {
      it("should allow access when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callGetDocument(ctx, "doc-123");

        expect(result).toBeDefined();
        expect(result.id).toBe("doc-123");
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callGetDocument(ctx, "doc-123");

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when user is global guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await callGetDocument(ctx, "doc-123");

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when FREE_ENTRY is true", async () => {
        process.env.FREE_ENTRY = "true";
        const ctx = createContext({ userAddress: "0xanyone" });

        const result = await callGetDocument(ctx, "doc-123");

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });
    });

    describe("Document Permission Access", () => {
      it("should check document permissions when no global access", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callGetDocument(ctx, "doc-123");

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "doc-123",
          "0xpermitted",
          expect.any(Function),
        );
      });

      it("should deny access when user has no permissions", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          GraphQLError,
        );
        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          "Forbidden: insufficient permissions to read this document",
        );
      });

      it("should deny access when user is not authenticated", async () => {
        const ctx = createContext({});

        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          "Forbidden",
        );
      });
    });

    describe("Document validation", () => {
      it("should throw error when docId is not provided", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await expect(callGetDocument(ctx, "")).rejects.toThrow(
          "Document id is required",
        );
      });

      it("should verify document is in specified drive when driveId provided", async () => {
        mockReactorClient.find = vi.fn().mockResolvedValue({
          results: [],
          options: { limit: 10, cursor: "" },
        } as PagedResults<PHDocument>);
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await expect(
          callGetDocument(ctx, "doc-123", "drive-1"),
        ).rejects.toThrow("is not part of");
      });

      it("should throw error if document type does not match", async () => {
        const wrongTypeDoc = {
          ...mockDocument,
          header: { ...mockDocument.header, documentType: "other/type" },
        };
        mockReactorClient.get = vi.fn().mockResolvedValue({
          document: wrongTypeDoc,
          childIds: [],
        });
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await expect(callGetDocument(ctx, "doc-123")).rejects.toThrow(
          "is not of type",
        );
      });
    });

    describe("Permission inheritance (hierarchy)", () => {
      it("should pass getParentIdsFn that retrieves parent IDs", async () => {
        const mockParents = [
          createMockDocument("parent-1", "Parent 1"),
          createMockDocument("parent-2", "Parent 2"),
        ];
        vi.mocked(mockReactorClient.getParents!).mockResolvedValue({
          results: mockParents,
          options: { limit: 10, cursor: "" },
        } as PagedResults<PHDocument>);

        let capturedGetParentsFn:
          | ((docId: string) => Promise<string[]>)
          | null = null;
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (_docId, _user, getParentsFn) => {
            capturedGetParentsFn = getParentsFn;
            return true;
          },
        );

        const ctx = createContext({ userAddress: "0xuser" });
        await callGetDocument(ctx, "child-doc");

        expect(capturedGetParentsFn).not.toBeNull();
        const parentIds = await capturedGetParentsFn!("child-doc");
        expect(parentIds).toEqual(["parent-1", "parent-2"]);
      });

      it("should return empty array if getParents fails", async () => {
        vi.mocked(mockReactorClient.getParents!).mockRejectedValue(
          new Error("Not found"),
        );

        let capturedGetParentsFn:
          | ((docId: string) => Promise<string[]>)
          | null = null;
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (_docId, _user, getParentsFn) => {
            capturedGetParentsFn = getParentsFn;
            return true;
          },
        );

        const ctx = createContext({ userAddress: "0xuser" });
        await callGetDocument(ctx, "child-doc");

        const parentIds = await capturedGetParentsFn!("child-doc");
        expect(parentIds).toEqual([]);
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.find to check document in drive", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callGetDocument(ctx, "doc-123", "drive-1");

        expect(mockReactorClient.find).toHaveBeenCalledWith({
          parentId: "drive-1",
          ids: ["doc-123"],
        });
      });

      it("should use reactorClient.get to fetch document", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callGetDocument(ctx, "doc-123");

        expect(mockReactorClient.get).toHaveBeenCalledWith("doc-123");
      });
    });
  });

  describe("Query: getDocuments", () => {
    const callGetDocuments = async (ctx: Context, driveId: string) => {
      const queryResolver = (subgraph.resolvers.Query as any)?.TestModel;
      const queryObject = queryResolver(null, {}, ctx);
      return queryObject.getDocuments({ driveId });
    };

    describe("Global Role Access", () => {
      it("should return all documents for admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callGetDocuments(ctx, "drive-1");

        expect(result).toHaveLength(1);
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should return all documents for user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callGetDocuments(ctx, "drive-1");

        expect(result).toHaveLength(1);
      });

      it("should return all documents for guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await callGetDocuments(ctx, "drive-1");

        expect(result).toHaveLength(1);
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

      it("should filter documents based on permissions when no global access", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (docId) =>
            docId === "drive-1" || docId === "doc-1" || docId === "doc-3",
        );
        const ctx = createContext({ userAddress: "0xpartial" });

        const result = await callGetDocuments(ctx, "drive-1");

        expect(result).toHaveLength(2);
        expect(result.map((d: any) => d.id).sort()).toEqual(["doc-1", "doc-3"]);
      });

      it("should return empty array when user has no document permissions", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (docId) => docId === "drive-1",
        );
        const ctx = createContext({ userAddress: "0xnopermissions" });

        const result = await callGetDocuments(ctx, "drive-1");

        expect(result).toHaveLength(0);
      });
    });

    describe("Drive permission check", () => {
      it("should check read permission on the drive first", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callGetDocuments(ctx, "drive-1")).rejects.toThrow(
          "Forbidden",
        );
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.find with type filter", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callGetDocuments(ctx, "drive-1");

        expect(mockReactorClient.find).toHaveBeenCalledWith({
          parentId: "drive-1",
          type: "powerhouse/test-model",
        });
      });
    });
  });

  describe("Mutation: createDocument", () => {
    const callCreateDocument = async (
      ctx: Context,
      name: string,
      driveId?: string,
    ) => {
      const mutation = (subgraph.resolvers.Mutation as any)
        ?.TestModel_createDocument;
      return mutation(null, { name, driveId }, ctx);
    };

    describe("Global Role Access (hasGlobalWriteAccess)", () => {
      it("should allow creation when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callCreateDocument(ctx, "New Doc");

        expect(result).toMatchObject({ id: "doc-123" });
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });

      it("should allow creation when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callCreateDocument(ctx, "New Doc");

        expect(result).toMatchObject({ id: "doc-123" });
      });

      it("should deny creation when user is only global guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        await expect(callCreateDocument(ctx, "New Doc")).rejects.toThrow(
          "Forbidden: insufficient permissions to create documents",
        );
      });
    });

    describe("With driveId", () => {
      it("should check write permission on drive when driveId provided", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callCreateDocument(ctx, "New Doc", "drive-1");

        expect(result).toMatchObject({ id: "doc-123" });
        expect(mockDocumentPermissionService.canWrite).toHaveBeenCalledWith(
          "drive-1",
          "0xpermitted",
          expect.any(Function),
        );
      });

      it("should deny creation when user cannot write to drive", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(
          callCreateDocument(ctx, "New Doc", "drive-1"),
        ).rejects.toThrow("Forbidden");
      });
    });

    describe("Without driveId", () => {
      it("should check global write access when no driveId", async () => {
        const ctx = createContext({ userAddress: "0xnoglobal" });

        await expect(callCreateDocument(ctx, "New Doc")).rejects.toThrow(
          "Forbidden: insufficient permissions to create documents",
        );
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.createEmpty with parentIdentifier", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callCreateDocument(ctx, "New Doc", "drive-1");

        expect(mockReactorClient.createEmpty).toHaveBeenCalledWith(
          "powerhouse/test-model",
          { parentIdentifier: "drive-1" },
        );
      });

      it("should use reactorClient.execute to set name", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callCreateDocument(ctx, "New Doc");

        expect(mockReactorClient.execute).toHaveBeenCalledWith(
          "doc-123",
          "main",
          [expect.objectContaining({ type: "SET_NAME" })],
        );
      });

      it("should not call execute if name is empty", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callCreateDocument(ctx, "");

        expect(mockReactorClient.createEmpty).toHaveBeenCalled();
        expect(mockReactorClient.execute).not.toHaveBeenCalled();
      });
    });
  });

  describe("Mutation: operations (setName, setValue, etc.)", () => {
    const callMutation = async (
      ctx: Context,
      operationName: string,
      docId: string,
      input: unknown,
    ) => {
      const mutation = (subgraph.resolvers.Mutation as any)?.[
        `TestModel_${operationName}`
      ];
      return mutation(null, { docId, input }, ctx);
    };

    describe("Write Permission Check", () => {
      it("should check write permission before executing operation", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xpermitted" });

        await callMutation(ctx, "setName", "doc-123", { name: "New Name" });

        expect(mockDocumentPermissionService.canWrite).toHaveBeenCalledWith(
          "doc-123",
          "0xpermitted",
          expect.any(Function),
        );
      });

      it("should deny operation when user cannot write", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(
          callMutation(ctx, "setName", "doc-123", { name: "New Name" }),
        ).rejects.toThrow("Forbidden: insufficient permissions to write");
      });

      it("should allow operation for global admin without permission check", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callMutation(ctx, "setName", "doc-123", {
          name: "New Name",
        });

        expect(result).toMatchObject({ id: "doc-123", revision: 2 });
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });

      it("should allow operation for global user without permission check", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callMutation(ctx, "setName", "doc-123", {
          name: "New Name",
        });

        expect(result).toMatchObject({ id: "doc-123", revision: 2 });
      });
    });

    describe("Operation-Level Permission Check", () => {
      it("should check operation restriction after write permission", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xpermitted" });

        await callMutation(ctx, "setName", "doc-123", { name: "New Name" });

        expect(
          mockDocumentPermissionService.isOperationRestricted,
        ).toHaveBeenCalledWith("doc-123", "SET_NAME");
      });

      it("should allow operation when not restricted", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callMutation(ctx, "setName", "doc-123", {
          name: "New Name",
        });

        expect(result).toMatchObject({ id: "doc-123", revision: 2 });
        expect(
          mockDocumentPermissionService.canExecuteOperation,
        ).not.toHaveBeenCalled();
      });

      it("should check operation permission when operation is restricted", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(true);
        vi.mocked(
          mockDocumentPermissionService.canExecuteOperation!,
        ).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xauthorized" });

        const result = await callMutation(ctx, "restrictedOp", "doc-123", {
          value: 42,
        });

        expect(result).toMatchObject({ id: "doc-123", revision: 2 });
        expect(
          mockDocumentPermissionService.canExecuteOperation,
        ).toHaveBeenCalledWith("doc-123", "RESTRICTED_OP", "0xauthorized");
      });

      it("should deny operation when user lacks operation permission", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(true);
        vi.mocked(
          mockDocumentPermissionService.canExecuteOperation!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunauthorized" });

        await expect(
          callMutation(ctx, "restrictedOp", "doc-123", { value: 42 }),
        ).rejects.toThrow(
          'Forbidden: insufficient permissions to execute operation "RESTRICTED_OP"',
        );
      });

      it("should skip operation restriction check for global admin", async () => {
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(true);
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callMutation(ctx, "restrictedOp", "doc-123", { value: 42 });

        expect(
          mockDocumentPermissionService.isOperationRestricted,
        ).not.toHaveBeenCalled();
      });
    });

    describe("Document type validation", () => {
      it("should throw error when document type does not match", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        const wrongTypeDoc = {
          ...mockDocument,
          header: { ...mockDocument.header, documentType: "other/type" },
        };
        mockReactorClient.get = vi.fn().mockResolvedValue({
          document: wrongTypeDoc,
          childIds: [],
        });
        const ctx = createContext({ userAddress: "0xpermitted" });

        await expect(
          callMutation(ctx, "setName", "doc-123", { name: "New Name" }),
        ).rejects.toThrow("is not of type");
      });
    });

    describe("reactorClient integration", () => {
      it("should use reactorClient.get to verify document", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callMutation(ctx, "setName", "doc-123", { name: "New Name" });

        expect(mockReactorClient.get).toHaveBeenCalledWith("doc-123");
      });

      it("should use reactorClient.execute to apply action", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

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
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callMutation(ctx, "setName", "doc-123", {
          name: "New Name",
        });

        expect(result).toMatchObject({ id: "doc-123", revision: 42 });
      });

      it("should handle execute errors gracefully", async () => {
        mockReactorClient.execute = vi
          .fn()
          .mockRejectedValue(new Error("Execute failed"));
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await expect(
          callMutation(ctx, "setName", "doc-123", { name: "New Name" }),
        ).rejects.toThrow("Execute failed");
      });
    });
  });

  describe("AUTH_ENABLED=false behavior", () => {
    it("should allow all read access when all roles return true", async () => {
      const ctx = createContext({
        isAdmin: true,
        isUser: true,
        isGuest: true,
        userAddress: "0xanyone",
      });

      const queryResolver = (subgraph.resolvers.Query as any)?.TestModel;
      const queryObject = queryResolver(null, {}, ctx);
      const result = await queryObject.getDocument({ docId: "doc-123" });

      expect(result).toBeDefined();
      expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
    });

    it("should allow all write access when admin/user roles return true", async () => {
      const ctx = createContext({
        isAdmin: true,
        isUser: true,
        isGuest: true,
        userAddress: "0xanyone",
      });

      const result = await (
        subgraph.resolvers.Mutation as any
      )?.TestModel_setName(
        null,
        { docId: "doc-123", input: { name: "New" } },
        ctx,
      );

      expect(result).toMatchObject({ id: "doc-123", revision: 2 });
      expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
    });
  });

  describe("No Permission Service", () => {
    let subgraphWithoutPermService: DocumentModelSubgraph;

    beforeEach(() => {
      subgraphWithoutPermService = new DocumentModelSubgraph(
        mockDocumentModel,
        {
          reactor: mockReactor as IDocumentDriveServer,
          reactorClient: mockReactorClient as IReactorClient,
          documentPermissionService: undefined,
          relationalDb: {} as any,
          graphqlManager: {} as any,
          syncManager: {} as any,
        } as SubgraphArgs,
      );
    });

    it("should deny read access when no permission service and no global access", async () => {
      const ctx = createContext({ userAddress: "0xuser" });
      const queryResolver = (subgraphWithoutPermService.resolvers.Query as any)
        ?.TestModel;
      const queryObject = queryResolver(null, {}, ctx);

      await expect(
        queryObject.getDocument({ docId: "doc-123" }),
      ).rejects.toThrow("Forbidden");
    });

    it("should deny write access when no permission service and no global access", async () => {
      const ctx = createContext({ userAddress: "0xuser" });

      await expect(
        (
          subgraphWithoutPermService.resolvers.Mutation as any
        )?.TestModel_setName(
          null,
          { docId: "doc-123", input: { name: "New" } },
          ctx,
        ),
      ).rejects.toThrow("Forbidden");
    });

    it("should allow access with global roles even without permission service", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });
      const queryResolver = (subgraphWithoutPermService.resolvers.Query as any)
        ?.TestModel;
      const queryObject = queryResolver(null, {}, ctx);

      const result = await queryObject.getDocument({ docId: "doc-123" });

      expect(result).toBeDefined();
    });

    it("should skip operation restriction check when no permission service", async () => {
      const ctx = createContext({ isUser: true, userAddress: "0xuser" });

      const result = await (
        subgraphWithoutPermService.resolvers.Mutation as any
      )?.TestModel_setName(
        null,
        { docId: "doc-123", input: { name: "New" } },
        ctx,
      );

      expect(result).toMatchObject({ id: "doc-123", revision: 2 });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty user address in context", async () => {
      const ctx = {
        user: { address: "" },
        isAdmin: vi.fn().mockReturnValue(false),
        isUser: vi.fn().mockReturnValue(false),
        isGuest: vi.fn().mockReturnValue(false),
      } as unknown as Context;

      const queryResolver = (subgraph.resolvers.Query as any)?.TestModel;
      const queryObject = queryResolver(null, {}, ctx);

      await expect(
        queryObject.getDocument({ docId: "doc-123" }),
      ).rejects.toThrow("Forbidden");

      expect(ctx.isAdmin).toHaveBeenCalledWith("");
    });

    it("should pass correct operation type name to permission check", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      vi.mocked(
        mockDocumentPermissionService.isOperationRestricted!,
      ).mockResolvedValue(true);
      vi.mocked(
        mockDocumentPermissionService.canExecuteOperation!,
      ).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xuser" });

      await (subgraph.resolvers.Mutation as any)?.TestModel_setValue(
        null,
        { docId: "doc-123", input: { value: 42 } },
        ctx,
      );

      expect(
        mockDocumentPermissionService.isOperationRestricted,
      ).toHaveBeenCalledWith("doc-123", "SET_VALUE");
    });
  });
});
