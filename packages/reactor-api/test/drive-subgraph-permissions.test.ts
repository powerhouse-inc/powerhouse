import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { DriveSubgraph } from "@powerhousedao/reactor-api";
import { testSetupReactor } from "@powerhousedao/reactor-api/test";
import { generateId } from "document-model/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";

describe("DriveSubgraph Permission Checks", () => {
  let mockDocumentPermissionService: Partial<DocumentPermissionService>;
  let driveSubgraph: DriveSubgraph;
  let driveId: string;

  // Helper to create context with different permission levels
  const createContext = (options: {
    isAdmin?: boolean;
    isUser?: boolean;
    isGuest?: boolean;
    userAddress?: string;
    driveId?: string;
  }) => ({
    driveId: options.driveId ?? driveId,
    user: options.userAddress ? { address: options.userAddress } : undefined,
    isAdmin: () => options.isAdmin ?? false,
    isUser: () => options.isUser ?? false,
    isGuest: () => options.isGuest ?? false,
  });

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock DocumentPermissionService
    mockDocumentPermissionService = {
      canReadDocument: vi.fn().mockResolvedValue(false),
      canWriteDocument: vi.fn().mockResolvedValue(false),
      canRead: vi.fn().mockResolvedValue(false),
      canWrite: vi.fn().mockResolvedValue(false),
    };

    const { reactor } = await testSetupReactor();

    // Create a test drive
    driveId = generateId();
    await reactor.addDrive({
      id: driveId,
      slug: "test-drive",
      global: {
        name: "Test Drive",
        icon: undefined,
      },
    });

    driveSubgraph = new DriveSubgraph({
      reactor,
      documentPermissionService:
        mockDocumentPermissionService as DocumentPermissionService,
    } as SubgraphArgs);
  });

  describe("registerPullResponderListener", () => {
    const callRegisterPullResponderListener = async (ctx: any) => {
      const mutation = (driveSubgraph.resolvers.Mutation as any)
        ?.registerPullResponderListener;
      return mutation(
        null,
        { filter: { branch: ["main"], documentId: [] } },
        ctx,
      );
    };

    describe("Global Role Access", () => {
      it("should allow access when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callRegisterPullResponderListener(ctx);

        expect(result).toBeDefined();
        expect(result.listenerId).toBeDefined();
        expect(
          mockDocumentPermissionService.canReadDocument,
        ).not.toHaveBeenCalled();
      });

      it("should allow access when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callRegisterPullResponderListener(ctx);

        expect(result).toBeDefined();
        expect(result.listenerId).toBeDefined();
        expect(
          mockDocumentPermissionService.canReadDocument,
        ).not.toHaveBeenCalled();
      });

      it("should allow access when user is global guest", async () => {
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        const result = await callRegisterPullResponderListener(ctx);

        expect(result).toBeDefined();
        expect(result.listenerId).toBeDefined();
        expect(
          mockDocumentPermissionService.canReadDocument,
        ).not.toHaveBeenCalled();
      });
    });

    describe("Document Permission Access", () => {
      it("should allow access when user has document read permission", async () => {
        vi.mocked(
          mockDocumentPermissionService.canReadDocument!,
        ).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callRegisterPullResponderListener(ctx);

        expect(result).toBeDefined();
        expect(result.listenerId).toBeDefined();
        expect(
          mockDocumentPermissionService.canReadDocument,
        ).toHaveBeenCalledWith(driveId, "0xpermitted");
      });

      it("should deny access when user has no permissions", async () => {
        vi.mocked(
          mockDocumentPermissionService.canReadDocument!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callRegisterPullResponderListener(ctx)).rejects.toThrow(
          "Forbidden",
        );
      });

      it("should deny access when user is not authenticated", async () => {
        const ctx = createContext({});

        await expect(callRegisterPullResponderListener(ctx)).rejects.toThrow(
          "Forbidden",
        );
      });
    });
  });

  describe("pushUpdates", () => {
    const callPushUpdates = async (ctx: any) => {
      const mutation = (driveSubgraph.resolvers.Mutation as any)?.pushUpdates;
      return mutation(
        null,
        {
          strands: [
            {
              driveId,
              documentId: "doc1",
              documentType: "test/type",
              scope: "global",
              branch: "main",
              operations: [],
            },
          ],
        },
        ctx,
      );
    };

    describe("Global Role Access", () => {
      it("should allow access when user is global admin", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        const result = await callPushUpdates(ctx);

        expect(result).toBeDefined();
        expect(
          mockDocumentPermissionService.canWriteDocument,
        ).not.toHaveBeenCalled();
      });

      it("should allow access when user is global user", async () => {
        const ctx = createContext({ isUser: true, userAddress: "0xuser" });

        const result = await callPushUpdates(ctx);

        expect(result).toBeDefined();
        expect(
          mockDocumentPermissionService.canWriteDocument,
        ).not.toHaveBeenCalled();
      });

      it("should deny access when user is only global guest (guests cannot write)", async () => {
        vi.mocked(
          mockDocumentPermissionService.canWriteDocument!,
        ).mockResolvedValue(false);
        const ctx = createContext({ isGuest: true, userAddress: "0xguest" });

        await expect(callPushUpdates(ctx)).rejects.toThrow("Forbidden");
      });
    });

    describe("Document Permission Access", () => {
      it("should allow access when user has document write permission", async () => {
        vi.mocked(
          mockDocumentPermissionService.canWriteDocument!,
        ).mockResolvedValue(true);
        const ctx = createContext({ userAddress: "0xpermitted" });

        const result = await callPushUpdates(ctx);

        expect(result).toBeDefined();
        expect(
          mockDocumentPermissionService.canWriteDocument,
        ).toHaveBeenCalledWith(driveId, "0xpermitted");
      });

      it("should deny access when user has no write permission", async () => {
        vi.mocked(
          mockDocumentPermissionService.canWriteDocument!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunpermitted" });

        await expect(callPushUpdates(ctx)).rejects.toThrow("Forbidden");
      });
    });
  });

  describe("strands (Sync.strands)", () => {
    // Note: strands resolver requires a registered listener, which needs full infrastructure
    // These tests verify the resolver exists; full permission testing is done via integration tests
    const callStrands = async (ctx: any) => {
      const syncResolver = (driveSubgraph.resolvers.Sync as any)?.strands;
      if (!syncResolver) {
        throw new Error("Sync.strands resolver not found");
      }
      return syncResolver(
        null,
        { listenerId: "test-listener", since: undefined },
        ctx,
      );
    };

    describe("Global Role Access", () => {
      it("should have strands resolver defined", () => {
        const syncResolver = (driveSubgraph.resolvers.Sync as any)?.strands;
        expect(syncResolver).toBeDefined();
      });

      // Note: Full strands permission tests require actual listener infrastructure
      // which is better tested via integration tests. Permission checks happen
      // before the listener lookup, so if listener is not found, permission passed.
      it("should pass permission check for global admin (fails on missing listener)", async () => {
        const ctx = createContext({ isAdmin: true, userAddress: "0xadmin" });

        // Permission passes, but fails on listener lookup (not a permission error)
        await expect(callStrands(ctx)).rejects.toThrow("Listener not found");
        expect(
          mockDocumentPermissionService.canReadDocument,
        ).not.toHaveBeenCalled();
      });
    });

    describe("Document Permission Access", () => {
      it("should return empty array when user has no read permission", async () => {
        vi.mocked(
          mockDocumentPermissionService.canReadDocument!,
        ).mockResolvedValue(false);
        const ctx = createContext({ userAddress: "0xunpermitted" });

        const result = await callStrands(ctx);

        expect(result).toEqual([]);
      });

      it("should return empty array for unauthenticated user", async () => {
        const ctx = createContext({});

        const result = await callStrands(ctx);

        expect(result).toEqual([]);
      });
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

      const registerResult = await (
        driveSubgraph.resolvers.Mutation as any
      )?.registerPullResponderListener(
        null,
        { filter: { branch: ["main"], documentId: [] } },
        ctx,
      );

      expect(registerResult).toBeDefined();
      expect(
        mockDocumentPermissionService.canReadDocument,
      ).not.toHaveBeenCalled();
    });
  });
});
