import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import type { PHDocument } from "document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReactorSubgraph } from "../src/graphql/reactor/subgraph.js";
import type { SubgraphArgs } from "../src/graphql/types.js";
import { runMigrations } from "../src/migrations/index.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { getDbClient } from "../src/utils/db.js";

/**
 * Integration tests for document permissions with the ReactorSubgraph.
 * These tests use a real DocumentPermissionService with an in-memory database.
 */
describe("Permissions Integration Tests", () => {
  let documentPermissionService: DocumentPermissionService;
  let mockReactorClient: Partial<IReactorClient>;
  let reactorSubgraph: ReactorSubgraph;
  let db: Kysely<DocumentPermissionDatabase>;

  // Mock document data
  const createMockDocument = (id: string, name: string): PHDocument =>
    ({
      header: {
        id,
        slug: id,
        name,
        documentType: "powerhouse/document-drive",
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
  const mockChildDocument = createMockDocument("child-doc", "Child Document");
  const mockParentDocument = createMockDocument(
    "parent-doc",
    "Parent Document",
  );

  // Context factory
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

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create real in-memory database and permission service
    const { db: dbClient } = getDbClient();
    db = dbClient as Kysely<DocumentPermissionDatabase>;
    await runMigrations(db as Kysely<unknown>);
    documentPermissionService = new DocumentPermissionService(db);

    // Create mock ReactorClient with parent hierarchy
    mockReactorClient = {
      get: vi.fn().mockImplementation(async (id: string) => {
        if (id === "doc-123") return mockDocument;
        if (id === "child-doc") return mockChildDocument;
        if (id === "parent-doc") return mockParentDocument;
        return null;
      }),
      getChildren: vi.fn().mockResolvedValue({
        results: [],
        options: { limit: 10, cursor: "" },
      } as PagedResults<PHDocument>),
      getParents: vi.fn().mockImplementation(async (id: string) => {
        // child-doc has parent-doc as parent
        if (id === "child-doc") {
          return {
            results: [mockParentDocument],
            options: { limit: 10, cursor: "" },
          } as PagedResults<PHDocument>;
        }
        return {
          results: [],
          options: { limit: 10, cursor: "" },
        } as PagedResults<PHDocument>;
      }),
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
      documentPermissionService,
      reactor: {} as any,
      relationalDb: {} as any,
      analyticsStore: {} as any,
      graphqlManager: {} as any,
    } as SubgraphArgs);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("Document Query with Real Permission Service", () => {
    const callDocument = async (ctx: any, identifier: string) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      return query(null, { identifier }, ctx);
    };

    it("should deny access when user has no permission", async () => {
      const ctx = createContext({ userAddress: "0xunpermitted" });

      await expect(callDocument(ctx, "doc-123")).rejects.toThrow("Forbidden");
    });

    it("should allow access when user has READ permission", async () => {
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xuser",
        "READ",
        "0xadmin",
      );
      const ctx = createContext({ userAddress: "0xuser" });

      const result = await callDocument(ctx, "doc-123");

      expect(result).toBeDefined();
      expect(result.document.id).toBe("doc-123");
    });

    it("should allow access when user has WRITE permission", async () => {
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xuser",
        "WRITE",
        "0xadmin",
      );
      const ctx = createContext({ userAddress: "0xuser" });

      const result = await callDocument(ctx, "doc-123");

      expect(result).toBeDefined();
    });

    it("should allow access when user has ADMIN permission", async () => {
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xuser",
        "ADMIN",
        "0xadmin",
      );
      const ctx = createContext({ userAddress: "0xuser" });

      const result = await callDocument(ctx, "doc-123");

      expect(result).toBeDefined();
    });

    it("should allow access via group permission", async () => {
      const group = await documentPermissionService.createGroup("Readers");
      await documentPermissionService.addUserToGroup("0xuser", group.id);
      await documentPermissionService.grantGroupPermission(
        "doc-123",
        group.id,
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });
      const result = await callDocument(ctx, "doc-123");

      expect(result).toBeDefined();
    });

    it("should be case-insensitive for user addresses", async () => {
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xABCDEF",
        "READ",
        "0xadmin",
      );
      const ctx = createContext({ userAddress: "0xabcdef" });

      const result = await callDocument(ctx, "doc-123");

      expect(result).toBeDefined();
    });
  });

  describe("Permission Inheritance via Parent Hierarchy", () => {
    const callDocument = async (ctx: any, identifier: string) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      return query(null, { identifier }, ctx);
    };

    it("should allow access to child when user has permission on parent", async () => {
      // Grant permission on parent document
      await documentPermissionService.grantPermission(
        "parent-doc",
        "0xuser",
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      // Should be able to access child document via inheritance
      const result = await callDocument(ctx, "child-doc");

      expect(result).toBeDefined();
      expect(result.document.id).toBe("child-doc");
    });

    it("should deny access to child when user has no permission in hierarchy", async () => {
      // Grant permission on different document (not in hierarchy)
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xuser",
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      // Should not be able to access child document
      await expect(callDocument(ctx, "child-doc")).rejects.toThrow("Forbidden");
    });

    it("should allow direct permission even without parent permission", async () => {
      // Grant permission directly on child
      await documentPermissionService.grantPermission(
        "child-doc",
        "0xuser",
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      const result = await callDocument(ctx, "child-doc");

      expect(result).toBeDefined();
    });

    it("should allow child access via group permission on parent", async () => {
      const group =
        await documentPermissionService.createGroup("ParentReaders");
      await documentPermissionService.addUserToGroup("0xuser", group.id);
      await documentPermissionService.grantGroupPermission(
        "parent-doc",
        group.id,
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });
      const result = await callDocument(ctx, "child-doc");

      expect(result).toBeDefined();
    });
  });

  describe("Mutation Permissions with Real Permission Service", () => {
    describe("deleteDocument", () => {
      const callDeleteDocument = async (ctx: any, identifier: string) => {
        const mutation = (reactorSubgraph.resolvers.Mutation as any)
          ?.deleteDocument;
        return mutation(null, { identifier }, ctx);
      };

      it("should deny delete when user has only READ permission", async () => {
        await documentPermissionService.grantPermission(
          "doc-123",
          "0xuser",
          "READ",
          "0xadmin",
        );
        const ctx = createContext({ userAddress: "0xuser" });

        await expect(callDeleteDocument(ctx, "doc-123")).rejects.toThrow(
          "Forbidden",
        );
      });

      it("should allow delete when user has WRITE permission", async () => {
        await documentPermissionService.grantPermission(
          "doc-123",
          "0xuser",
          "WRITE",
          "0xadmin",
        );
        const ctx = createContext({ userAddress: "0xuser" });

        const result = await callDeleteDocument(ctx, "doc-123");

        expect(result).toBe(true);
      });

      it("should allow delete when user has ADMIN permission", async () => {
        await documentPermissionService.grantPermission(
          "doc-123",
          "0xuser",
          "ADMIN",
          "0xadmin",
        );
        const ctx = createContext({ userAddress: "0xuser" });

        const result = await callDeleteDocument(ctx, "doc-123");

        expect(result).toBe(true);
      });

      it("should allow delete via group WRITE permission", async () => {
        const group = await documentPermissionService.createGroup("Writers");
        await documentPermissionService.addUserToGroup("0xuser", group.id);
        await documentPermissionService.grantGroupPermission(
          "doc-123",
          group.id,
          "WRITE",
          "0xadmin",
        );

        const ctx = createContext({ userAddress: "0xuser" });
        const result = await callDeleteDocument(ctx, "doc-123");

        expect(result).toBe(true);
      });
    });

    describe("moveChildren", () => {
      const callMoveChildren = async (
        ctx: any,
        sourceId: string,
        targetId: string,
      ) => {
        const mutation = (reactorSubgraph.resolvers.Mutation as any)
          ?.moveChildren;
        return mutation(
          null,
          {
            sourceParentIdentifier: sourceId,
            targetParentIdentifier: targetId,
            documentIdentifiers: ["child-doc"],
          },
          ctx,
        );
      };

      it("should deny move when user lacks write permission on source", async () => {
        await documentPermissionService.grantPermission(
          "parent-doc",
          "0xuser",
          "READ",
          "0xadmin",
        );
        await documentPermissionService.grantPermission(
          "doc-123",
          "0xuser",
          "WRITE",
          "0xadmin",
        );

        const ctx = createContext({ userAddress: "0xuser" });

        await expect(
          callMoveChildren(ctx, "parent-doc", "doc-123"),
        ).rejects.toThrow("Forbidden");
      });

      it("should deny move when user lacks write permission on target", async () => {
        await documentPermissionService.grantPermission(
          "parent-doc",
          "0xuser",
          "WRITE",
          "0xadmin",
        );
        await documentPermissionService.grantPermission(
          "doc-123",
          "0xuser",
          "READ",
          "0xadmin",
        );

        const ctx = createContext({ userAddress: "0xuser" });

        await expect(
          callMoveChildren(ctx, "parent-doc", "doc-123"),
        ).rejects.toThrow("Forbidden");
      });

      it("should allow move when user has write permission on both", async () => {
        await documentPermissionService.grantPermission(
          "parent-doc",
          "0xuser",
          "WRITE",
          "0xadmin",
        );
        await documentPermissionService.grantPermission(
          "doc-123",
          "0xuser",
          "WRITE",
          "0xadmin",
        );

        const ctx = createContext({ userAddress: "0xuser" });
        const result = await callMoveChildren(ctx, "parent-doc", "doc-123");

        expect(result).toBeDefined();
      });
    });
  });

  describe("findDocuments Filtering with Real Permission Service", () => {
    const callFindDocuments = async (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.findDocuments;
      return query(
        null,
        { search: { type: "powerhouse/document-drive" } },
        ctx,
      );
    };

    beforeEach(() => {
      // Setup find to return multiple documents
      const doc1 = createMockDocument("doc-1", "Doc 1");
      const doc2 = createMockDocument("doc-2", "Doc 2");
      const doc3 = createMockDocument("doc-3", "Doc 3");

      vi.mocked(mockReactorClient.find!).mockResolvedValue({
        results: [doc1, doc2, doc3],
        options: { limit: 10 },
      } as PagedResults<PHDocument>);
    });

    it("should filter results based on user permissions", async () => {
      // Grant permission only on doc-1 and doc-3
      await documentPermissionService.grantPermission(
        "doc-1",
        "0xuser",
        "READ",
        "0xadmin",
      );
      await documentPermissionService.grantPermission(
        "doc-3",
        "0xuser",
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });
      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(2);
      expect(result.items.map((d: any) => d.id).sort()).toEqual([
        "doc-1",
        "doc-3",
      ]);
    });

    it("should return empty when user has no permissions", async () => {
      const ctx = createContext({ userAddress: "0xunpermitted" });
      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(0);
    });

    it("should include documents accessible via groups", async () => {
      const group = await documentPermissionService.createGroup("DocReaders");
      await documentPermissionService.addUserToGroup("0xuser", group.id);
      await documentPermissionService.grantGroupPermission(
        "doc-2",
        group.id,
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });
      const result = await callFindDocuments(ctx);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("doc-2");
    });
  });

  describe("Global Role Override", () => {
    const callDocument = async (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      return query(null, { identifier: "doc-123" }, ctx);
    };

    it("should allow admin access without document permission", async () => {
      // No document permission granted
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await callDocument(ctx);

      expect(result).toBeDefined();
    });

    it("should allow user access without document permission", async () => {
      // No document permission granted
      const ctx = createContext({ isUser: true, userAddress: "0xuser" });

      const result = await callDocument(ctx);

      expect(result).toBeDefined();
    });

    it("should allow guest read access without document permission", async () => {
      // No document permission granted
      const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

      const result = await callDocument(ctx);

      expect(result).toBeDefined();
    });

    it("global role should take precedence over document permission check", async () => {
      // Grant conflicting permission (just to show global role wins)
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xother",
        "READ",
        "0xadmin",
      );

      // This user has global admin but no document permission
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await callDocument(ctx);

      expect(result).toBeDefined();
    });
  });

  describe("Permission Revocation Flow", () => {
    const callDocument = async (ctx: any) => {
      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      return query(null, { identifier: "doc-123" }, ctx);
    };

    it("should deny access after permission is revoked", async () => {
      // Grant permission
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xuser",
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      // Should have access
      const result1 = await callDocument(ctx);
      expect(result1).toBeDefined();

      // Revoke permission
      await documentPermissionService.revokePermission("doc-123", "0xuser");

      // Should no longer have access
      await expect(callDocument(ctx)).rejects.toThrow("Forbidden");
    });

    it("should deny access after group membership is removed", async () => {
      const group = await documentPermissionService.createGroup("TempReaders");
      await documentPermissionService.addUserToGroup("0xuser", group.id);
      await documentPermissionService.grantGroupPermission(
        "doc-123",
        group.id,
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      // Should have access via group
      const result1 = await callDocument(ctx);
      expect(result1).toBeDefined();

      // Remove from group
      await documentPermissionService.removeUserFromGroup("0xuser", group.id);

      // Should no longer have access
      await expect(callDocument(ctx)).rejects.toThrow("Forbidden");
    });

    it("should deny access after group permission is revoked", async () => {
      const group = await documentPermissionService.createGroup("TempReaders");
      await documentPermissionService.addUserToGroup("0xuser", group.id);
      await documentPermissionService.grantGroupPermission(
        "doc-123",
        group.id,
        "READ",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      // Should have access via group
      const result1 = await callDocument(ctx);
      expect(result1).toBeDefined();

      // Revoke group permission
      await documentPermissionService.revokeGroupPermission(
        "doc-123",
        group.id,
      );

      // Should no longer have access
      await expect(callDocument(ctx)).rejects.toThrow("Forbidden");
    });
  });

  describe("Complex Permission Scenarios", () => {
    it("should use highest permission from multiple groups", async () => {
      const readersGroup =
        await documentPermissionService.createGroup("Readers");
      const writersGroup =
        await documentPermissionService.createGroup("Writers");

      await documentPermissionService.addUserToGroup("0xuser", readersGroup.id);
      await documentPermissionService.addUserToGroup("0xuser", writersGroup.id);

      await documentPermissionService.grantGroupPermission(
        "doc-123",
        readersGroup.id,
        "READ",
        "0xadmin",
      );
      await documentPermissionService.grantGroupPermission(
        "doc-123",
        writersGroup.id,
        "WRITE",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      // Should be able to delete (requires WRITE)
      const mutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.deleteDocument;
      const result = await mutation(null, { identifier: "doc-123" }, ctx);

      expect(result).toBe(true);
    });

    it("should combine direct and group permissions", async () => {
      // User has direct READ on doc-123
      await documentPermissionService.grantPermission(
        "doc-123",
        "0xuser",
        "READ",
        "0xadmin",
      );

      // User is in group with WRITE on different document (parent-doc)
      const group =
        await documentPermissionService.createGroup("ParentWriters");
      await documentPermissionService.addUserToGroup("0xuser", group.id);
      await documentPermissionService.grantGroupPermission(
        "parent-doc",
        group.id,
        "WRITE",
        "0xadmin",
      );

      const ctx = createContext({ userAddress: "0xuser" });

      // Can read doc-123 (direct permission)
      const query = (reactorSubgraph.resolvers.Query as any)?.document;
      const readResult = await query(null, { identifier: "doc-123" }, ctx);
      expect(readResult).toBeDefined();

      // Cannot write doc-123 (only has READ)
      const deleteMutation = (reactorSubgraph.resolvers.Mutation as any)
        ?.deleteDocument;
      await expect(
        deleteMutation(null, { identifier: "doc-123" }, ctx),
      ).rejects.toThrow("Forbidden");

      // Can write parent-doc (group permission)
      const deleteParent = await deleteMutation(
        null,
        { identifier: "parent-doc" },
        ctx,
      );
      expect(deleteParent).toBe(true);
    });
  });
});
