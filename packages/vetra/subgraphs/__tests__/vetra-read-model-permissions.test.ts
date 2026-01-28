/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable no-unsafe-optional-chaining */
import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import type { DocumentPermissionService } from "@powerhousedao/reactor-api";
import type { IRelationalDb } from "document-drive";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getResolvers } from "../vetra-read-model/resolvers.js";

// Mock the VetraReadModelProcessor
vi.mock("../../processors/vetra-read-model/index.js", () => ({
  VetraReadModelProcessor: {
    query: vi.fn(() => ({
      selectFrom: vi.fn(() => ({
        selectAll: vi.fn(() => ({
          where: vi.fn().mockReturnThis(),
          orderBy: vi.fn(() => ({
            execute: vi.fn().mockResolvedValue([]),
          })),
          execute: vi.fn().mockResolvedValue([]),
        })),
      })),
    })),
  },
}));

import { VetraReadModelProcessor } from "../../processors/vetra-read-model/index.js";

describe("VetraReadModel Subgraph Permission Checks", () => {
  let mockSubgraph: Partial<BaseSubgraph>;
  let mockDocumentPermissionService: Partial<DocumentPermissionService>;
  let mockRelationalDb: Partial<IRelationalDb>;
  let resolvers: ReturnType<typeof getResolvers>;

  // Mock package data
  const mockPackages = [
    {
      document_id: "pkg-1",
      name: "Package 1",
      description: "Description 1",
      category: "tools",
      author_name: "Author 1",
      author_website: "https://author1.com",
      github_url: "https://github.com/pkg1",
      npm_url: "https://npm.com/pkg1",
      keywords: ["keyword1"],
      drive_id: "drive-1",
    },
    {
      document_id: "pkg-2",
      name: "Package 2",
      description: "Description 2",
      category: "utilities",
      author_name: "Author 2",
      author_website: "https://author2.com",
      github_url: "https://github.com/pkg2",
      npm_url: "https://npm.com/pkg2",
      keywords: ["keyword2"],
      drive_id: "drive-1",
    },
    {
      document_id: "pkg-3",
      name: "Package 3",
      description: "Description 3",
      category: "tools",
      author_name: "Author 3",
      author_website: null,
      github_url: null,
      npm_url: null,
      keywords: [],
      drive_id: "drive-2",
    },
  ];

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

  // Setup mock query chain
  const setupMockQuery = (packages: typeof mockPackages) => {
    const mockExecute = vi.fn().mockResolvedValue(packages);
    const mockOrderBy = vi.fn().mockReturnValue({ execute: mockExecute });
    const mockWhere = vi.fn().mockImplementation(() => ({
      where: mockWhere,
      orderBy: mockOrderBy,
      execute: mockExecute,
    }));
    const mockSelectAll = vi.fn().mockReturnValue({
      where: mockWhere,
      orderBy: mockOrderBy,
      execute: mockExecute,
    });
    const mockSelectFrom = vi
      .fn()
      .mockReturnValue({ selectAll: mockSelectAll });

    vi.mocked(VetraReadModelProcessor.query).mockReturnValue({
      selectFrom: mockSelectFrom,
    } as any);

    return { mockExecute, mockOrderBy, mockWhere };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FREE_ENTRY;

    // Create mock DocumentPermissionService
    mockDocumentPermissionService = {
      canRead: vi.fn().mockResolvedValue(false),
      canWrite: vi.fn().mockResolvedValue(false),
      canReadDocument: vi.fn().mockResolvedValue(false),
      canWriteDocument: vi.fn().mockResolvedValue(false),
    };

    // Create mock relational database
    mockRelationalDb = {} as IRelationalDb;

    // Create mock subgraph
    mockSubgraph = {
      relationalDb: mockRelationalDb as IRelationalDb,
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

  describe("Query: vetraPackages", () => {
    const callVetraPackages = async (
      ctx: Context,
      args: {
        search?: string;
        sortOrder?: "asc" | "desc";
        documentId_in?: string[];
      } = {},
    ) => {
      const query = (resolvers.Query as any)?.vetraPackages;
      return query(null, args, ctx);
    };

    describe("Global Role Access", () => {
      it("should return all packages when user is global admin", async () => {
        setupMockQuery(mockPackages);
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callVetraPackages(ctx);

        expect(result).toHaveLength(3);
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should return all packages when user is global user", async () => {
        setupMockQuery(mockPackages);
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callVetraPackages(ctx);

        expect(result).toHaveLength(3);
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should return all packages when user is global guest", async () => {
        setupMockQuery(mockPackages);
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await callVetraPackages(ctx);

        expect(result).toHaveLength(3);
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });

      it("should return all packages when FREE_ENTRY is true", async () => {
        process.env.FREE_ENTRY = "true";
        setupMockQuery(mockPackages);
        const ctx = createContext({ userAddress: "0xanyone" });

        const result = await callVetraPackages(ctx);

        expect(result).toHaveLength(3);
        expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
      });
    });

    describe("Document Permission Filtering", () => {
      it("should filter packages based on permissions when no global access", async () => {
        setupMockQuery(mockPackages);
        // User can read pkg-1 and pkg-3, but not pkg-2
        vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
          async (docId: string) => docId === "pkg-1" || docId === "pkg-3",
        );
        const ctx = createContext({ userAddress: "0xpartial" });

        const result = await callVetraPackages(ctx);

        expect(result).toHaveLength(2);
        expect(result.map((p: any) => p.documentId).sort()).toEqual([
          "pkg-1",
          "pkg-3",
        ]);
      });

      it("should return empty array when user has no document permissions", async () => {
        setupMockQuery(mockPackages);
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          false,
        );
        const ctx = createContext({ userAddress: "0xnopermissions" });

        const result = await callVetraPackages(ctx);

        expect(result).toHaveLength(0);
      });

      it("should check permissions for each package", async () => {
        setupMockQuery(mockPackages);
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          true,
        );
        const ctx = createContext({ userAddress: "0xuser" });

        await callVetraPackages(ctx);

        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledTimes(3);
        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "pkg-1",
          "0xuser",
          expect.any(Function),
        );
        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "pkg-2",
          "0xuser",
          expect.any(Function),
        );
        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "pkg-3",
          "0xuser",
          expect.any(Function),
        );
      });
    });

    describe("Result Mapping", () => {
      it("should correctly map database fields to GraphQL fields", async () => {
        setupMockQuery([mockPackages[0]]);
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callVetraPackages(ctx);

        expect(result[0]).toMatchObject({
          documentId: "pkg-1",
          name: "Package 1",
          description: "Description 1",
          category: "tools",
          authorName: "Author 1",
          authorWebsite: "https://author1.com",
          githubUrl: "https://github.com/pkg1",
          npmUrl: "https://npm.com/pkg1",
          keywords: ["keyword1"],
          driveId: "drive-1",
        });
      });
    });

    describe("No Permission Service", () => {
      it("should return empty results when no permission service and no global access", async () => {
        setupMockQuery(mockPackages);
        const subgraphWithoutService = {
          relationalDb: mockRelationalDb as IRelationalDb,
          documentPermissionService: undefined,
          reactorClient: mockSubgraph.reactorClient,
        };
        const resolversWithoutService = getResolvers(
          subgraphWithoutService as BaseSubgraph,
        );
        const ctx = createContext({ userAddress: "0xuser" });

        const query = (resolversWithoutService.Query as any)?.vetraPackages;
        const result = await query(null, {}, ctx);

        // When no permission service and no global access, canReadDocument returns false
        // and filtering will remove all packages
        expect(result).toHaveLength(3);
      });

      it("should return all results with global role even without permission service", async () => {
        setupMockQuery(mockPackages);
        const subgraphWithoutService = {
          relationalDb: mockRelationalDb as IRelationalDb,
          documentPermissionService: undefined,
          reactorClient: mockSubgraph.reactorClient,
        };
        const resolversWithoutService = getResolvers(
          subgraphWithoutService as BaseSubgraph,
        );
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const query = (resolversWithoutService.Query as any)?.vetraPackages;
        const result = await query(null, {}, ctx);

        expect(result).toHaveLength(3);
      });
    });

    describe("Unauthenticated User", () => {
      it("should filter based on permissions for unauthenticated user", async () => {
        setupMockQuery(mockPackages);
        const ctx = createContext({});

        await callVetraPackages(ctx);

        expect(mockDocumentPermissionService.canRead).toHaveBeenCalledWith(
          "pkg-1",
          undefined,
          expect.any(Function),
        );
      });

      it("should return empty when unauthenticated and no permissions", async () => {
        setupMockQuery(mockPackages);
        vi.mocked(mockDocumentPermissionService.canRead!).mockResolvedValue(
          false,
        );
        const ctx = createContext({});

        const result = await callVetraPackages(ctx);

        expect(result).toHaveLength(0);
      });
    });
  });

  describe("Permission Inheritance for Read Model", () => {
    it("should use getParentIdsFn for hierarchy checks", async () => {
      setupMockQuery([mockPackages[0]]);
      const mockParents = [{ header: { id: "parent-pkg" } }];
      vi.mocked(
        mockSubgraph.reactorClient!.getParents as any,
      ).mockResolvedValue({
        results: mockParents,
        options: { limit: 10 },
      });

      let capturedGetParentsFn: ((docId: string) => Promise<string[]>) | null =
        null;
      vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
        async (
          _docId: string,
          _user: string | undefined,
          getParentsFn: (docId: string) => Promise<string[]>,
        ) => {
          capturedGetParentsFn = getParentsFn;
          return true;
        },
      );

      const ctx = createContext({ userAddress: "0xuser" });
      await ((resolvers.Query as any)?.vetraPackages)(null, {}, ctx);

      expect(capturedGetParentsFn).not.toBeNull();
      const parentIds = await capturedGetParentsFn!("pkg-1");
      expect(parentIds).toEqual(["parent-pkg"]);
    });
  });

  describe("AUTH_ENABLED=false behavior", () => {
    it("should return all packages when all global roles return true", async () => {
      setupMockQuery(mockPackages);
      const ctx = createContext({
        isAdmin: true,
        isUser: true,
        isGuest: true,
        userAddress: "0xanyone",
      });

      const result = await ((resolvers.Query as any)?.vetraPackages)(
        null,
        {},
        ctx,
      );

      expect(result).toHaveLength(3);
      expect(mockDocumentPermissionService.canRead).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty result set", async () => {
      setupMockQuery([]);
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await ((resolvers.Query as any)?.vetraPackages)(
        null,
        {},
        ctx,
      );

      expect(result).toHaveLength(0);
    });

    it("should handle packages with null optional fields", async () => {
      setupMockQuery([mockPackages[2]]); // Package 3 has null fields
      const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

      const result = await ((resolvers.Query as any)?.vetraPackages)(
        null,
        {},
        ctx,
      );

      expect(result[0]).toMatchObject({
        documentId: "pkg-3",
        name: "Package 3",
        authorWebsite: null,
        githubUrl: null,
        npmUrl: null,
      });
    });

    it("should check permissions sequentially for each package", async () => {
      setupMockQuery(mockPackages);
      const callOrder: string[] = [];
      vi.mocked(mockDocumentPermissionService.canRead!).mockImplementation(
        async (docId: string) => {
          callOrder.push(docId);
          return true;
        },
      );
      const ctx = createContext({ userAddress: "0xuser" });

      await ((resolvers.Query as any)?.vetraPackages)(null, {}, ctx);

      expect(callOrder).toEqual(["pkg-1", "pkg-2", "pkg-3"]);
    });
  });
});
