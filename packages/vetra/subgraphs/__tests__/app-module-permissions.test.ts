/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */
import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import type { DocumentPermissionService } from "@powerhousedao/reactor-api/services/document-permission.service";
import type { IDocumentDriveServer } from "document-drive";
import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppModuleDocument } from "../../document-models/app-module/index.js";
import { appModuleDocumentType } from "../../document-models/app-module/index.js";
import { getResolvers } from "../app-module/resolvers.js";

describe("AppModule Subgraph Permission Checks", () => {
  let mockSubgraph: Partial<BaseSubgraph>;
  let mockDocumentPermissionService: Partial<DocumentPermissionService>;
  let mockReactor: Partial<IDocumentDriveServer>;
  let resolvers: ReturnType<typeof getResolvers>;

  // Mock document
  const createMockDocument = (id: string, name: string): AppModuleDocument =>
    ({
      header: {
        id,
        slug: id,
        name,
        documentType: appModuleDocumentType,
        revision: { global: 1 },
        createdAtUtcIso: new Date().toISOString(),
        lastModifiedAtUtcIso: new Date().toISOString(),
      },
      state: {
        global: {
          name,
          status: "draft",
          documentTypes: [],
          dragAndDropEnabled: false,
        },
        local: {},
      },
      initialState: {
        global: {
          name,
          status: "draft",
          documentTypes: [],
          dragAndDropEnabled: false,
        },
        local: {},
      },
      operations: {
        global: [],
        local: [],
      },
      attachments: {},
      clipboard: [],
    }) as unknown as AppModuleDocument;

  const mockDocument = createMockDocument("app-123", "Test App Module");

  // Helper to create context with different permission levels
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

    // Create mock DocumentPermissionService
    mockDocumentPermissionService = {
      canRead: vi.fn().mockResolvedValue(false),
      canWrite: vi.fn().mockResolvedValue(false),
      canReadDocument: vi.fn().mockResolvedValue(false),
      canWriteDocument: vi.fn().mockResolvedValue(false),
      isOperationRestricted: vi.fn().mockResolvedValue(false),
      canExecuteOperation: vi.fn().mockResolvedValue(false),
    };

    // Create mock reactor
    mockReactor = {
      getDocument: vi.fn().mockResolvedValue(mockDocument),
      getDocuments: vi.fn().mockResolvedValue(["app-123"]),
      addDocument: vi.fn().mockResolvedValue(mockDocument),
      addAction: vi.fn().mockResolvedValue({
        status: "SUCCESS",
        operations: [{ index: 1 }],
      }),
    };

    // Create mock subgraph
    mockSubgraph = {
      reactor: mockReactor as IDocumentDriveServer,
      documentPermissionService:
        mockDocumentPermissionService as DocumentPermissionService,
      reactorClient: {
        getParents: vi.fn().mockResolvedValue({
          results: [],
          options: { limit: 10 },
        }),
      } as any,
    };

    // Get resolvers
    resolvers = getResolvers(mockSubgraph as BaseSubgraph);
  });

  afterEach(() => {
    delete process.env.FREE_ENTRY;
  });

  describe("Query: AppModule.getDocument", () => {
    const callGetDocument = async (
      ctx: Context,
      docId: string,
      driveId?: string,
    ) => {
      const queryResolver = (resolvers.Query as any)?.AppModule;
      const queryObject = queryResolver(null, {}, ctx);
      return queryObject.getDocument({ docId, driveId });
    };

    describe("Global Role Access", () => {
      it("should allow access when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callGetDocument(ctx, "app-123");

        expect(result).toBeDefined();
        expect(result.id).toBe("app-123");
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callGetDocument(ctx, "app-123");

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when user is global guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await callGetDocument(ctx, "app-123");

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should allow access when FREE_ENTRY is true", async () => {
        process.env.FREE_ENTRY = "true";
        const ctx = createContext({ userAddress: "0xanyone" });

        const result = await callGetDocument(ctx, "app-123");

        expect(result).toBeDefined();
      });
    });

    describe("Document Permission Access", () => {
      it("should check document permissions when no global access", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callGetDocument(ctx, "app-123");

        expect(result).toBeDefined();
        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "app-123",
          "0xpermitted",
          expect.any(Function),
        );
      });

      it("should deny access when user has no permissions", async () => {
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callGetDocument(ctx, "app-123")).rejects.toThrow(
          GraphQLError,
        );
        await expect(callGetDocument(ctx, "app-123")).rejects.toThrow(
          "Forbidden",
        );
      });

      it("should deny access when user is not authenticated", async () => {
        const ctx = createContext({});

        await expect(callGetDocument(ctx, "app-123")).rejects.toThrow(
          "Forbidden",
        );
      });
    });

    describe("Validation", () => {
      it("should throw error when docId is not provided", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await expect(callGetDocument(ctx, "")).rejects.toThrow(
          "Document id is required",
        );
      });

      it("should verify document is in specified drive when driveId provided", async () => {
        mockReactor.getDocuments = vi.fn().mockResolvedValue(["other-doc"]);
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await expect(
          callGetDocument(ctx, "app-123", "drive-1"),
        ).rejects.toThrow("is not part of");
      });
    });
  });

  describe("Query: AppModule.getDocuments", () => {
    const callGetDocuments = async (ctx: Context, driveId: string) => {
      const queryResolver = (resolvers.Query as any)?.AppModule;
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
    });

    describe("Document Permission Filtering", () => {
      beforeEach(() => {
        // Setup multiple documents
        mockReactor.getDocuments = vi
          .fn()
          .mockResolvedValue(["app-1", "app-2", "app-3"]);
        mockReactor.getDocument = vi
          .fn()
          .mockImplementation((id: string) =>
            Promise.resolve(createMockDocument(id, `App ${id}`)),
          );
      });

      it("should filter documents based on permissions when no global access", async () => {
        // User can read drive-1 (required), app-1, and app-3, but not app-2
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (docId) =>
            docId === "drive-1" || docId === "app-1" || docId === "app-3",
        );
        const ctx = createContext({ userAddress: "0xpartial" });

        const result = await callGetDocuments(ctx, "drive-1");

        expect(result).toHaveLength(2);
        expect(result.map((d: any) => d.id).sort()).toEqual(["app-1", "app-3"]);
      });

      it("should return empty array when user has no document permissions", async () => {
        // User can read drive-1 but no documents inside it
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (docId) => docId === "drive-1",
        );
        const ctx = createContext({ userAddress: "0xnopermissions" });

        const result = await callGetDocuments(ctx, "drive-1");

        expect(result).toHaveLength(0);
      });
    });
  });

  describe("Mutation: AppModule_createDocument", () => {
    const callCreateDocument = async (
      ctx: Context,
      name: string,
      driveId?: string,
    ) => {
      const mutation = (resolvers.Mutation as any)?.AppModule_createDocument;
      return mutation(null, { name, driveId }, ctx);
    };

    describe("Global Role Access", () => {
      it("should allow creation when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callCreateDocument(ctx, "New App");

        expect(result).toBe("app-123");
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });

      it("should allow creation when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callCreateDocument(ctx, "New App");

        expect(result).toBe("app-123");
      });

      it("should deny creation when user is only global guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        await expect(callCreateDocument(ctx, "New App")).rejects.toThrow(
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

        const result = await callCreateDocument(ctx, "New App", "drive-1");

        expect(result).toBe("app-123");
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
          callCreateDocument(ctx, "New App", "drive-1"),
        ).rejects.toThrow("Forbidden");
      });
    });
  });

  describe("Mutation: AppModule_setAppName", () => {
    const callSetAppName = async (
      ctx: Context,
      docId: string,
      name: string,
    ) => {
      const mutation = (resolvers.Mutation as any)?.AppModule_setAppName;
      return mutation(null, { docId, input: { name } }, ctx);
    };

    describe("Write Permission Check", () => {
      it("should check write permission before executing operation", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xpermitted" });

        await callSetAppName(ctx, "app-123", "New Name");

        expect(mockDocumentPermissionService.canWrite).toHaveBeenCalledWith(
          "app-123",
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
          callSetAppName(ctx, "app-123", "New Name"),
        ).rejects.toThrow("Forbidden: insufficient permissions to write");
      });

      it("should allow operation for global admin without permission check", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callSetAppName(ctx, "app-123", "New Name");

        expect(result).toBe(true);
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });
    });

    describe("Operation-Level Permission Check", () => {
      it("should check operation restriction", async () => {
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xpermitted" });

        await callSetAppName(ctx, "app-123", "New Name");

        expect(
          mockDocumentPermissionService.isOperationRestricted,
        ).toHaveBeenCalledWith("app-123", "SET_APP_NAME");
      });

      it("should deny operation when restricted and user lacks permission", async () => {
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
          callSetAppName(ctx, "app-123", "New Name"),
        ).rejects.toThrow(
          'Forbidden: insufficient permissions to execute operation "SET_APP_NAME"',
        );
      });

      it("should allow operation when restricted and user has permission", async () => {
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

        const result = await callSetAppName(ctx, "app-123", "New Name");

        expect(result).toBe(true);
      });

      it("should skip restriction check for global admin", async () => {
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(true);
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await callSetAppName(ctx, "app-123", "New Name");

        expect(
          mockDocumentPermissionService.isOperationRestricted,
        ).not.toHaveBeenCalled();
      });
    });
  });

  describe("Mutation: AppModule_setAppStatus", () => {
    const callSetAppStatus = async (
      ctx: Context,
      docId: string,
      status: string,
    ) => {
      const mutation = (resolvers.Mutation as any)?.AppModule_setAppStatus;
      return mutation(null, { docId, input: { status } }, ctx);
    };

    it("should check write and operation permissions", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      vi.mocked(
        mockDocumentPermissionService.isOperationRestricted!,
      ).mockResolvedValue(true);
      vi.mocked(
        mockDocumentPermissionService.canExecuteOperation!,
      ).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      // Use valid status value: "CONFIRMED" or "DRAFT"
      await callSetAppStatus(ctx, "app-123", "CONFIRMED");

      expect(
        mockDocumentPermissionService.isOperationRestricted,
      ).toHaveBeenCalledWith("app-123", "SET_APP_STATUS");
      expect(
        mockDocumentPermissionService.canExecuteOperation,
      ).toHaveBeenCalledWith("app-123", "SET_APP_STATUS", "0xpermitted");
    });
  });

  describe("Mutation: AppModule_addDocumentType", () => {
    const callAddDocumentType = async (
      ctx: Context,
      docId: string,
      input: { documentType: string },
    ) => {
      const mutation = (resolvers.Mutation as any)?.AppModule_addDocumentType;
      return mutation(null, { docId, input }, ctx);
    };

    it("should check operation permission for ADD_DOCUMENT_TYPE", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      vi.mocked(
        mockDocumentPermissionService.isOperationRestricted!,
      ).mockResolvedValue(true);
      vi.mocked(
        mockDocumentPermissionService.canExecuteOperation!,
      ).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await callAddDocumentType(ctx, "app-123", {
        documentType: "powerhouse/test",
      });

      expect(
        mockDocumentPermissionService.isOperationRestricted,
      ).toHaveBeenCalledWith("app-123", "ADD_DOCUMENT_TYPE");
    });
  });

  describe("Mutation: AppModule_removeDocumentType", () => {
    const callRemoveDocumentType = async (
      ctx: Context,
      docId: string,
      input: { documentType: string },
    ) => {
      const mutation = (resolvers.Mutation as any)
        ?.AppModule_removeDocumentType;
      return mutation(null, { docId, input }, ctx);
    };

    it("should check operation permission for REMOVE_DOCUMENT_TYPE", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      vi.mocked(
        mockDocumentPermissionService.isOperationRestricted!,
      ).mockResolvedValue(true);
      vi.mocked(
        mockDocumentPermissionService.canExecuteOperation!,
      ).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await callRemoveDocumentType(ctx, "app-123", {
        documentType: "powerhouse/test",
      });

      expect(
        mockDocumentPermissionService.isOperationRestricted,
      ).toHaveBeenCalledWith("app-123", "REMOVE_DOCUMENT_TYPE");
    });
  });

  describe("Mutation: AppModule_setDocumentTypes", () => {
    const callSetDocumentTypes = async (
      ctx: Context,
      docId: string,
      input: { documentTypes: string[] },
    ) => {
      const mutation = (resolvers.Mutation as any)?.AppModule_setDocumentTypes;
      return mutation(null, { docId, input }, ctx);
    };

    it("should check operation permission for SET_DOCUMENT_TYPES", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      vi.mocked(
        mockDocumentPermissionService.isOperationRestricted!,
      ).mockResolvedValue(true);
      vi.mocked(
        mockDocumentPermissionService.canExecuteOperation!,
      ).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await callSetDocumentTypes(ctx, "app-123", {
        documentTypes: ["powerhouse/test1", "powerhouse/test2"],
      });

      expect(
        mockDocumentPermissionService.isOperationRestricted,
      ).toHaveBeenCalledWith("app-123", "SET_DOCUMENT_TYPES");
    });
  });

  describe("Mutation: AppModule_setDragAndDropEnabled", () => {
    const callSetDragAndDropEnabled = async (
      ctx: Context,
      docId: string,
      input: { enabled: boolean },
    ) => {
      const mutation = (resolvers.Mutation as any)
        ?.AppModule_setDragAndDropEnabled;
      return mutation(null, { docId, input }, ctx);
    };

    it("should check operation permission for SET_DRAG_AND_DROP_ENABLED", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      vi.mocked(
        mockDocumentPermissionService.isOperationRestricted!,
      ).mockResolvedValue(true);
      vi.mocked(
        mockDocumentPermissionService.canExecuteOperation!,
      ).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await callSetDragAndDropEnabled(ctx, "app-123", { enabled: true });

      expect(
        mockDocumentPermissionService.isOperationRestricted,
      ).toHaveBeenCalledWith("app-123", "SET_DRAG_AND_DROP_ENABLED");
    });
  });

  describe("Permission Inheritance", () => {
    it("should use getParentIdsFn for hierarchy checks", async () => {
      const mockParents = [createMockDocument("parent-app", "Parent App")];
      vi.mocked(
        mockSubgraph.reactorClient!.getParents as any,
      ).mockResolvedValue({
        results: mockParents,
        options: { limit: 10 },
      });

      let capturedGetParentsFn: ((docId: string) => Promise<string[]>) | null =
        null;
      vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
        async (_docId, _user, getParentsFn) => {
          capturedGetParentsFn = getParentsFn;
          return true;
        },
      );

      const ctx = createContext({ userAddress: "0xuser" });
      const queryResolver = (resolvers.Query as any)?.AppModule;
      const queryObject = queryResolver(null, {}, ctx);
      await queryObject.getDocument({ docId: "child-app" });

      expect(capturedGetParentsFn).not.toBeNull();
      const parentIds = await capturedGetParentsFn!("child-app");
      expect(parentIds).toEqual(["parent-app"]);
    });
  });

  describe("No Permission Service", () => {
    let resolversWithoutPermService: ReturnType<typeof getResolvers>;

    beforeEach(() => {
      const subgraphWithoutService = {
        reactor: mockReactor as IDocumentDriveServer,
        documentPermissionService: undefined,
        reactorClient: mockSubgraph.reactorClient,
      };
      resolversWithoutPermService = getResolvers(
        subgraphWithoutService as BaseSubgraph,
      );
    });

    it("should deny read access when no permission service and no global access", async () => {
      const ctx = createContext({ userAddress: "0xuser" });
      const queryResolver = (resolversWithoutPermService.Query as any)
        ?.AppModule;
      const queryObject = queryResolver(null, {}, ctx);

      await expect(
        queryObject.getDocument({ docId: "app-123" }),
      ).rejects.toThrow("Forbidden");
    });

    it("should allow access with global roles even without permission service", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });
      const queryResolver = (resolversWithoutPermService.Query as any)
        ?.AppModule;
      const queryObject = queryResolver(null, {}, ctx);

      const result = await queryObject.getDocument({ docId: "app-123" });

      expect(result).toBeDefined();
    });
  });

  describe("Edge Cases", () => {
    it("should handle document not found", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      mockReactor.getDocument = vi.fn().mockResolvedValue(null);
      const ctx = createContext({ userAddress: "0xpermitted" });

      const mutation = (resolvers.Mutation as any)?.AppModule_setAppName;
      await expect(
        mutation(null, { docId: "non-existent", input: { name: "New" } }, ctx),
      ).rejects.toThrow("Document not found");
    });

    it("should handle reactor action failure", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      mockReactor.addAction = vi.fn().mockResolvedValue({
        status: "ERROR",
        error: { message: "Action failed" },
      });
      const ctx = createContext({ userAddress: "0xpermitted" });

      const mutation = (resolvers.Mutation as any)?.AppModule_setAppName;
      await expect(
        mutation(null, { docId: "app-123", input: { name: "New" } }, ctx),
      ).rejects.toThrow("Action failed");
    });
  });
});
