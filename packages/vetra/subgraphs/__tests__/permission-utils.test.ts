/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/unbound-method */
import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import type { DocumentPermissionService } from "@powerhousedao/reactor-api/services/document-permission.service";
import { GraphQLError } from "graphql";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCanExecuteOperation,
  assertCanRead,
  assertCanWrite,
  canReadDocument,
  canWriteDocument,
  hasGlobalReadAccess,
  hasGlobalWriteAccess,
} from "../permission-utils.js";

describe("permission-utils", () => {
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

  describe("hasGlobalReadAccess", () => {
    afterEach(() => {
      delete process.env.FREE_ENTRY;
    });

    describe("Role-based access", () => {
      it("should return true when user is global admin", () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
        expect(ctx.isAdmin).toHaveBeenCalledWith("0xadmin");
      });

      it("should return true when user is global user", () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
        expect(ctx.isUser).toHaveBeenCalledWith("0xuser");
      });

      it("should return true when user is global guest", () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
        expect(ctx.isGuest).toHaveBeenCalledWith("0xguest");
      });

      it("should return false when user has no global role", () => {
        const ctx = createContext({ userAddress: "0xnorole" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(false);
      });

      it("should return false when user is not authenticated (no address)", () => {
        const ctx = createContext({});

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(false);
        // Should call with empty string when no user address
        expect(ctx.isAdmin).toHaveBeenCalledWith("");
      });
    });

    describe("FREE_ENTRY environment variable", () => {
      it("should return true when FREE_ENTRY is 'true' regardless of roles", () => {
        process.env.FREE_ENTRY = "true";
        const ctx = createContext({ userAddress: "0xanyone" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
      });

      it("should return true when FREE_ENTRY is 'true' even without authentication", () => {
        process.env.FREE_ENTRY = "true";
        const ctx = createContext({});

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
      });

      it("should not grant access when FREE_ENTRY is 'false'", () => {
        process.env.FREE_ENTRY = "false";
        const ctx = createContext({ userAddress: "0xanyone" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(false);
      });

      it("should not grant access when FREE_ENTRY is not set", () => {
        const ctx = createContext({ userAddress: "0xanyone" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(false);
      });
    });

    describe("Combined roles", () => {
      it("should return true when user has multiple roles (admin + user)", () => {
        const ctx = createContext({
          isAdmin: true,
          isUser: true,
          userAddress: "0xmultirole",
        });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
      });

      it("should return true when all roles are true (AUTH_ENABLED=false scenario)", () => {
        const ctx = createContext({
          isAdmin: true,
          isUser: true,
          isGuest: true,
          userAddress: "0xanyone",
        });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
      });
    });
  });

  describe("hasGlobalWriteAccess", () => {
    describe("Role-based access", () => {
      it("should return true when user is global admin", () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(true);
      });

      it("should return true when user is global user", () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(true);
      });

      it("should return false when user is only global guest", () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(false);
      });

      it("should return false when user has no global role", () => {
        const ctx = createContext({ userAddress: "0xnorole" });

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(false);
      });

      it("should return false when user is not authenticated", () => {
        const ctx = createContext({});

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(false);
      });
    });

    describe("Guest cannot write", () => {
      it("should return false for guest even with FREE_ENTRY", () => {
        process.env.FREE_ENTRY = "true";
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(false);
        delete process.env.FREE_ENTRY;
      });
    });

    describe("Combined roles", () => {
      it("should return true when user is both guest and user (user wins)", () => {
        const ctx = createContext({
          isGuest: true,
          isUser: true,
          userAddress: "0xmixed",
        });

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(true);
      });
    });
  });

  describe("canReadDocument", () => {
    let mockSubgraph: Partial<BaseSubgraph>;
    let mockDocumentPermissionService: Partial<DocumentPermissionService>;

    beforeEach(() => {
      mockDocumentPermissionService = {
        canRead: vi.fn().mockResolvedValue(false),
        canWrite: vi.fn().mockResolvedValue(false),
        canReadDocument: vi.fn().mockResolvedValue(false),
        canWriteDocument: vi.fn().mockResolvedValue(false),
      };

      mockSubgraph = {
        documentPermissionService:
          mockDocumentPermissionService as DocumentPermissionService,
        reactorClient: {
          getParents: vi.fn().mockResolvedValue({
            results: [],
            options: { limit: 10 },
          }),
        } as any,
      };
    });

    describe("Global access bypass", () => {
      it("should return true immediately when user has global read access", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await canReadDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(true);
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should return true for guest without checking document permissions", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await canReadDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(true);
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });
    });

    describe("Document-level permissions", () => {
      it("should check document permission service when no global access", async () => {
        const ctx = createContext({ userAddress: "0xuser" });
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          true,
        );

        const result = await canReadDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(true);
        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "doc-123",
          "0xuser",
          expect.any(Function),
        );
      });

      it("should return false when user has no document permission", async () => {
        const ctx = createContext({ userAddress: "0xunpermitted" });
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          false,
        );

        const result = await canReadDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(false);
      });

      it("should pass undefined user address to permission service when no user", async () => {
        const ctx = createContext({});

        await canReadDocument(mockSubgraph as BaseSubgraph, "doc-123", ctx);

        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "doc-123",
          undefined,
          expect.any(Function),
        );
      });
    });

    describe("No permission service", () => {
      it("should return false when no permission service is available", async () => {
        const subgraphWithoutService = {
          documentPermissionService: undefined,
          reactorClient: mockSubgraph.reactorClient,
        };
        const ctx = createContext({ userAddress: "0xuser" });

        const result = await canReadDocument(
          subgraphWithoutService as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(false);
      });
    });

    describe("Hierarchy function (getParentIdsFn)", () => {
      it("should pass a function that retrieves parent IDs", async () => {
        const ctx = createContext({ userAddress: "0xuser" });
        const mockParents = [
          { header: { id: "parent-1" } },
          { header: { id: "parent-2" } },
        ];
        vi.mocked(
          mockSubgraph.reactorClient!.getParents as any,
        ).mockResolvedValue({
          results: mockParents,
          options: { limit: 10 },
        });

        let capturedGetParentsFn:
          | ((docId: string) => Promise<string[]>)
          | null = null;
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (_docId, _user, getParentsFn) => {
            capturedGetParentsFn = getParentsFn;
            return false;
          },
        );

        await canReadDocument(mockSubgraph as BaseSubgraph, "child-doc", ctx);

        expect(capturedGetParentsFn).not.toBeNull();
        const parentIds = await capturedGetParentsFn!("child-doc");
        expect(parentIds).toEqual(["parent-1", "parent-2"]);
        expect(mockSubgraph.reactorClient!.getParents).toHaveBeenCalledWith(
          "child-doc",
        );
      });

      it("should return empty array if getParents fails", async () => {
        const ctx = createContext({ userAddress: "0xuser" });
        vi.mocked(
          mockSubgraph.reactorClient!.getParents as any,
        ).mockRejectedValue(new Error("Not found"));

        let capturedGetParentsFn:
          | ((docId: string) => Promise<string[]>)
          | null = null;
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (_docId, _user, getParentsFn) => {
            capturedGetParentsFn = getParentsFn;
            return false;
          },
        );

        await canReadDocument(mockSubgraph as BaseSubgraph, "child-doc", ctx);

        const parentIds = await capturedGetParentsFn!("child-doc");
        expect(parentIds).toEqual([]);
      });
    });
  });

  describe("canWriteDocument", () => {
    let mockSubgraph: Partial<BaseSubgraph>;
    let mockDocumentPermissionService: Partial<DocumentPermissionService>;

    beforeEach(() => {
      mockDocumentPermissionService = {
        canRead: vi.fn().mockResolvedValue(false),
        canWrite: vi.fn().mockResolvedValue(false),
      };

      mockSubgraph = {
        documentPermissionService:
          mockDocumentPermissionService as DocumentPermissionService,
        reactorClient: {
          getParents: vi.fn().mockResolvedValue({
            results: [],
            options: { limit: 10 },
          }),
        } as any,
      };
    });

    describe("Global access bypass", () => {
      it("should return true immediately when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await canWriteDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(true);
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });

      it("should return true immediately when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await canWriteDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(true);
        expect(mockDocumentPermissionService.canWrite).not.toHaveBeenCalled();
      });

      it("should NOT return true for global guest (guests cannot write)", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await canWriteDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        // Guest has no global write access, so should check document permissions
        expect(mockDocumentPermissionService.canWrite).toHaveBeenCalled();
        expect(result).toBe(false);
      });
    });

    describe("Document-level permissions", () => {
      it("should check document permission service when no global write access", async () => {
        const ctx = createContext({ userAddress: "0xuser" });
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          true,
        );

        const result = await canWriteDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(true);
        expect(mockDocumentPermissionService.canWrite).toHaveBeenCalledWith(
          "doc-123",
          "0xuser",
          expect.any(Function),
        );
      });

      it("should return false when user has no document write permission", async () => {
        const ctx = createContext({ userAddress: "0xunpermitted" });
        vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
          false,
        );

        const result = await canWriteDocument(
          mockSubgraph as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(false);
      });
    });

    describe("No permission service", () => {
      it("should return false when no permission service is available", async () => {
        const subgraphWithoutService = {
          documentPermissionService: undefined,
          reactorClient: mockSubgraph.reactorClient,
        };
        const ctx = createContext({ userAddress: "0xuser" });

        const result = await canWriteDocument(
          subgraphWithoutService as BaseSubgraph,
          "doc-123",
          ctx,
        );

        expect(result).toBe(false);
      });
    });
  });

  describe("assertCanRead", () => {
    let mockSubgraph: Partial<BaseSubgraph>;
    let mockDocumentPermissionService: Partial<DocumentPermissionService>;

    beforeEach(() => {
      mockDocumentPermissionService = {
        canRead: vi.fn().mockResolvedValue(false),
      };

      mockSubgraph = {
        documentPermissionService:
          mockDocumentPermissionService as DocumentPermissionService,
        reactorClient: {
          getParents: vi.fn().mockResolvedValue({
            results: [],
            options: { limit: 10 },
          }),
        } as any,
      };
    });

    it("should not throw when user has global read access", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      await expect(
        assertCanRead(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).resolves.not.toThrow();
    });

    it("should not throw when user has document read permission", async () => {
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(true);
      const ctx = createContext({ userAddress: "0xpermitted" });

      await expect(
        assertCanRead(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).resolves.not.toThrow();
    });

    it("should throw GraphQLError when user cannot read", async () => {
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(
        assertCanRead(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).rejects.toThrow(GraphQLError);
    });

    it("should throw with correct error message", async () => {
      vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(
        assertCanRead(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).rejects.toThrow(
        "Forbidden: insufficient permissions to read this document",
      );
    });

    it("should throw for unauthenticated user", async () => {
      const ctx = createContext({});

      await expect(
        assertCanRead(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("assertCanWrite", () => {
    let mockSubgraph: Partial<BaseSubgraph>;
    let mockDocumentPermissionService: Partial<DocumentPermissionService>;

    beforeEach(() => {
      mockDocumentPermissionService = {
        canWrite: vi.fn().mockResolvedValue(false),
      };

      mockSubgraph = {
        documentPermissionService:
          mockDocumentPermissionService as DocumentPermissionService,
        reactorClient: {
          getParents: vi.fn().mockResolvedValue({
            results: [],
            options: { limit: 10 },
          }),
        } as any,
      };
    });

    it("should not throw when user has global write access", async () => {
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      await expect(
        assertCanWrite(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).resolves.not.toThrow();
    });

    it("should not throw when user has document write permission", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        true,
      );
      const ctx = createContext({ userAddress: "0xpermitted" });

      await expect(
        assertCanWrite(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).resolves.not.toThrow();
    });

    it("should throw GraphQLError when user cannot write", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(
        assertCanWrite(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).rejects.toThrow(GraphQLError);
    });

    it("should throw with correct error message", async () => {
      vi.mocked(mockDocumentPermissionService.canWrite!).mockResolvedValue(
        false,
      );
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(
        assertCanWrite(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).rejects.toThrow(
        "Forbidden: insufficient permissions to write to this document",
      );
    });

    it("should throw for guest user (guests cannot write)", async () => {
      const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

      await expect(
        assertCanWrite(mockSubgraph as BaseSubgraph, "doc-123", ctx),
      ).rejects.toThrow("Forbidden");
    });
  });

  describe("assertCanExecuteOperation", () => {
    let mockSubgraph: Partial<BaseSubgraph>;
    let mockDocumentPermissionService: Partial<DocumentPermissionService>;

    beforeEach(() => {
      mockDocumentPermissionService = {
        isOperationRestricted: vi.fn().mockResolvedValue(false),
        canExecuteOperation: vi.fn().mockResolvedValue(false),
      };

      mockSubgraph = {
        documentPermissionService:
          mockDocumentPermissionService as DocumentPermissionService,
      };
    });

    describe("No permission service", () => {
      it("should not throw when no permission service is available", async () => {
        const subgraphWithoutService = {
          documentPermissionService: undefined,
        };
        const ctx = createContext({ userAddress: "0xuser" });

        await expect(
          assertCanExecuteOperation(
            subgraphWithoutService as BaseSubgraph,
            "doc-123",
            "SET_NAME",
            ctx,
          ),
        ).resolves.not.toThrow();
      });
    });

    describe("Admin bypass", () => {
      it("should not throw when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        await expect(
          assertCanExecuteOperation(
            mockSubgraph as BaseSubgraph,
            "doc-123",
            "SET_NAME",
            ctx,
          ),
        ).resolves.not.toThrow();

        // Should not check operation restrictions for admin
        expect(
          mockDocumentPermissionService.isOperationRestricted,
        ).not.toHaveBeenCalled();
      });
    });

    describe("Unrestricted operations", () => {
      it("should not throw when operation is not restricted", async () => {
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xuser" });

        await expect(
          assertCanExecuteOperation(
            mockSubgraph as BaseSubgraph,
            "doc-123",
            "COMMON_OPERATION",
            ctx,
          ),
        ).resolves.not.toThrow();

        expect(
          mockDocumentPermissionService.isOperationRestricted,
        ).toHaveBeenCalledWith("doc-123", "COMMON_OPERATION");
        expect(
          mockDocumentPermissionService.canExecuteOperation,
        ).not.toHaveBeenCalled();
      });
    });

    describe("Restricted operations", () => {
      beforeEach(() => {
        vi.mocked(
          mockDocumentPermissionService.isOperationRestricted!,
        ).mockResolvedValue(true);
      });

      it("should not throw when user has operation permission", async () => {
        vi.mocked(
          mockDocumentPermissionService.canExecuteOperation!,
        ).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xauthorized" });

        await expect(
          assertCanExecuteOperation(
            mockSubgraph as BaseSubgraph,
            "doc-123",
            "RESTRICTED_OP",
            ctx,
          ),
        ).resolves.not.toThrow();

        expect(
          mockDocumentPermissionService.canExecuteOperation,
        ).toHaveBeenCalledWith("doc-123", "RESTRICTED_OP", "0xauthorized");
      });

      it("should throw when user lacks operation permission", async () => {
        vi.mocked(
          mockDocumentPermissionService.canExecuteOperation!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunauthorized" });

        await expect(
          assertCanExecuteOperation(
            mockSubgraph as BaseSubgraph,
            "doc-123",
            "RESTRICTED_OP",
            ctx,
          ),
        ).rejects.toThrow(GraphQLError);
      });

      it("should throw with operation name in error message", async () => {
        vi.mocked(
          mockDocumentPermissionService.canExecuteOperation!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunauthorized" });

        await expect(
          assertCanExecuteOperation(
            mockSubgraph as BaseSubgraph,
            "doc-123",
            "SET_SENSITIVE_DATA",
            ctx,
          ),
        ).rejects.toThrow(
          'Forbidden: insufficient permissions to execute operation "SET_SENSITIVE_DATA" on this document',
        );
      });

      it("should pass undefined user address when not authenticated", async () => {
        vi.mocked(
          mockDocumentPermissionService.canExecuteOperation!,
        ).mockResolvedValue(false);
        const ctx = createContext({});

        await expect(
          assertCanExecuteOperation(
            mockSubgraph as BaseSubgraph,
            "doc-123",
            "RESTRICTED_OP",
            ctx,
          ),
        ).rejects.toThrow("Forbidden");

        expect(
          mockDocumentPermissionService.canExecuteOperation,
        ).toHaveBeenCalledWith("doc-123", "RESTRICTED_OP", undefined);
      });
    });
  });

  describe("Edge Cases", () => {
    describe("Null/undefined context fields", () => {
      it("hasGlobalReadAccess should handle context without isAdmin function", () => {
        const ctx = {
          user: { address: "0xuser" },
          isUser: vi.fn().mockReturnValue(true),
          isGuest: vi.fn().mockReturnValue(false),
        } as unknown as Context;

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(true);
      });

      it("hasGlobalWriteAccess should handle context without isUser function", () => {
        const ctx = {
          user: { address: "0xadmin" },
          isAdmin: vi.fn().mockReturnValue(true),
          isGuest: vi.fn().mockReturnValue(false),
        } as unknown as Context;

        const result = hasGlobalWriteAccess(ctx);

        expect(result).toBe(true);
      });
    });

    describe("Empty string user address", () => {
      it("should handle empty string user address", () => {
        const ctx = createContext({ userAddress: "" });

        const result = hasGlobalReadAccess(ctx);

        expect(result).toBe(false);
        expect(ctx.isAdmin).toHaveBeenCalledWith("");
      });
    });

    describe("Case sensitivity", () => {
      it("should pass user address as-is to permission checks", async () => {
        const mockDocPermService = {
          canRead: vi.fn().mockResolvedValue(true),
        };
        const mockSubgraph = {
          documentPermissionService:
            mockDocPermService as unknown as DocumentPermissionService,
          reactorClient: {
            getParents: vi.fn().mockResolvedValue({ results: [] }),
          } as any,
        };
        const ctx = createContext({ userAddress: "0xABCDEF" });

        await canReadDocument(mockSubgraph as BaseSubgraph, "doc-123", ctx);

        expect(mockDocPermService.canRead).toHaveBeenCalledWith(
          "doc-123",
          "0xABCDEF",
          expect.any(Function),
        );
      });
    });
  });
});
