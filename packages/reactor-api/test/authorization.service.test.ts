import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IAuthorizationService } from "../src/services/authorization.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";
import type { DocumentPermissionLevel } from "../src/utils/db.js";

describe("createAuthorizationService", () => {
  let service: IAuthorizationService;
  let mockPermissionService: Partial<DocumentPermissionService>;
  /** parent map consumed by the injected getParentIds resolver */
  let parents: Record<string, string[]>;
  /** per-document direct grants for the user under test */
  let directGrants: Record<string, DocumentPermissionLevel>;
  /** per-document group grants for the user under test */
  let groupGrants: Record<string, DocumentPermissionLevel>;
  const getParentIds = vi.fn((documentId: string) =>
    Promise.resolve(parents[documentId] ?? []),
  );

  beforeEach(() => {
    vi.clearAllMocks();
    parents = {};
    directGrants = {};
    groupGrants = {};
    mockPermissionService = {
      isProtectedWithAncestors: vi.fn().mockResolvedValue(false),
      getDocumentOwner: vi.fn().mockResolvedValue(null),
      getUserPermission: vi.fn((documentId: string) =>
        Promise.resolve(directGrants[documentId] ?? null),
      ),
      getUserGroupPermission: vi.fn((documentId: string) =>
        Promise.resolve(groupGrants[documentId] ?? null),
      ),
      isOperationRestricted: vi.fn().mockResolvedValue(false),
      hasOperationGrant: vi.fn().mockResolvedValue(false),
    };
    service = createAuthorizationService(
      {
        admins: ["0xadmin"],
        defaultProtection: false,
        policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
      },
      mockPermissionService as DocumentPermissionService,
      getParentIds,
    );
  });

  describe("isSupremeAdmin", () => {
    it("should return true for admin address", () => {
      expect(service.isSupremeAdmin("0xadmin")).toBe(true);
    });

    it("should return true case-insensitively", () => {
      expect(service.isSupremeAdmin("0xADMIN")).toBe(true);
    });

    it("should return false for non-admin", () => {
      expect(service.isSupremeAdmin("0xuser")).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(service.isSupremeAdmin(undefined)).toBe(false);
    });
  });

  describe("canCreate", () => {
    it("should allow supreme admin", () => {
      expect(service.canCreate("0xadmin")).toBe(true);
    });

    it("should allow any authenticated user", () => {
      expect(service.canCreate("0xuser")).toBe(true);
    });

    it("should deny anonymous", () => {
      expect(service.canCreate(undefined)).toBe(false);
    });
  });

  describe("canRead", () => {
    it("should allow supreme admin without touching the permission store", async () => {
      const result = await service.canRead("doc-1", "0xadmin");
      expect(result).toBe(true);
      expect(
        mockPermissionService.isProtectedWithAncestors,
      ).not.toHaveBeenCalled();
    });

    it("should allow anonymous read on unprotected document", async () => {
      const result = await service.canRead("doc-1", undefined);
      expect(result).toBe(true);
    });

    it("should allow authenticated read on unprotected document", async () => {
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should consult protection with the injected parent resolver", async () => {
      await service.canRead("doc-1", "0xuser");
      expect(
        mockPermissionService.isProtectedWithAncestors,
      ).toHaveBeenCalledWith("doc-1", getParentIds);
    });

    it("should deny anonymous read on protected document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      const result = await service.canRead("doc-1", undefined);
      expect(result).toBe(false);
    });

    it("should allow owner read on protected document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        "0xowner",
      );
      const result = await service.canRead("doc-1", "0xOwner");
      expect(result).toBe(true);
    });

    it("should allow read with a direct grant of any level", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      directGrants["doc-1"] = "READ";
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should allow read with a group grant", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      groupGrants["doc-1"] = "READ";
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should deny read when no grant on protected document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(false);
    });

    it("should inherit a grant from a parent document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      parents["doc-1"] = ["parent-1"];
      directGrants["parent-1"] = "READ";
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should inherit a grant from a grandparent document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      parents["doc-1"] = ["parent-1"];
      parents["parent-1"] = ["grandparent-1"];
      groupGrants["grandparent-1"] = "WRITE";
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should terminate on cyclic parent relationships", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      parents["doc-1"] = ["doc-2"];
      parents["doc-2"] = ["doc-1"];
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(false);
    });
  });

  describe("canWrite", () => {
    it("should allow supreme admin", async () => {
      const result = await service.canWrite("doc-1", "0xadmin");
      expect(result).toBe(true);
    });

    it("should allow anonymous write on unprotected document", async () => {
      const result = await service.canWrite("doc-1", undefined);
      expect(result).toBe(true);
    });

    it("should deny anonymous write on protected document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      const result = await service.canWrite("doc-1", undefined);
      expect(result).toBe(false);
    });

    it("should allow owner write on protected document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        "0xowner",
      );
      const result = await service.canWrite("doc-1", "0xowner");
      expect(result).toBe(true);
    });

    it("should deny write with only a READ grant", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      directGrants["doc-1"] = "READ";
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(false);
    });

    it("should allow write with a WRITE grant", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      directGrants["doc-1"] = "WRITE";
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should allow write with an ADMIN grant", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      directGrants["doc-1"] = "ADMIN";
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should allow write with a group WRITE grant", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      groupGrants["doc-1"] = "WRITE";
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should inherit a WRITE grant from a parent document", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      parents["doc-1"] = ["parent-1"];
      directGrants["parent-1"] = "WRITE";
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should not satisfy WRITE via an inherited READ grant", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      parents["doc-1"] = ["parent-1"];
      directGrants["parent-1"] = "READ";
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(false);
    });
  });

  describe("canManage", () => {
    it("should allow supreme admin", async () => {
      const result = await service.canManage("doc-1", "0xadmin");
      expect(result).toBe(true);
    });

    it("should deny unauthenticated", async () => {
      const result = await service.canManage("doc-1", undefined);
      expect(result).toBe(false);
    });

    it("should allow owner", async () => {
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        "0xowner",
      );
      const result = await service.canManage("doc-1", "0xowner");
      expect(result).toBe(true);
    });

    it("should allow user with a direct ADMIN grant", async () => {
      directGrants["doc-1"] = "ADMIN";
      const result = await service.canManage("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should allow user with a group ADMIN grant", async () => {
      groupGrants["doc-1"] = "ADMIN";
      const result = await service.canManage("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should deny user with only a WRITE grant", async () => {
      directGrants["doc-1"] = "WRITE";
      const result = await service.canManage("doc-1", "0xuser");
      expect(result).toBe(false);
    });
  });

  describe("canMutate", () => {
    it("should allow supreme admin", async () => {
      const result = await service.canMutate("doc-1", "SET_NAME", "0xadmin");
      expect(result).toBe(true);
    });

    it("should allow write for unrestricted operations", async () => {
      const result = await service.canMutate("doc-1", "SET_NAME", "0xuser");
      expect(result).toBe(true);
    });

    it("should allow READ-only user with operation grant for restricted ops", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.hasOperationGrant!).mockResolvedValue(
        true,
      );
      const result = await service.canMutate(
        "doc-1",
        "SPECIAL_OP",
        "0xreadonly",
      );
      expect(result).toBe(true);
      expect(mockPermissionService.hasOperationGrant).toHaveBeenCalledWith(
        "doc-1",
        "SPECIAL_OP",
        "0xreadonly",
      );
    });

    it("should deny when restricted and no operation grant", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      const result = await service.canMutate("doc-1", "SPECIAL_OP", "0xuser");
      expect(result).toBe(false);
    });

    it("should deny anonymous for restricted operations", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      const result = await service.canMutate("doc-1", "SPECIAL_OP", undefined);
      expect(result).toBe(false);
    });

    it("should allow the document owner for restricted operations", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        "0xowner",
      );
      const result = await service.canMutate("doc-1", "SPECIAL_OP", "0xowner");
      expect(result).toBe(true);
      expect(mockPermissionService.hasOperationGrant).not.toHaveBeenCalled();
    });

    it("should allow an ADMIN grantee for restricted operations", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      directGrants["doc-1"] = "ADMIN";
      const result = await service.canMutate("doc-1", "SPECIAL_OP", "0xuser");
      expect(result).toBe(true);
    });

    it("should allow anonymous for unrestricted operations on unprotected doc", async () => {
      const result = await service.canMutate("doc-1", "SET_NAME", undefined);
      expect(result).toBe(true);
    });

    it("should deny anonymous for unrestricted operations on protected doc", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      const result = await service.canMutate("doc-1", "SET_NAME", undefined);
      expect(result).toBe(false);
    });

    it("should deny a READ-only grantee for unrestricted operations on protected doc", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      directGrants["doc-1"] = "READ";
      const result = await service.canMutate("doc-1", "SET_NAME", "0xuser");
      expect(result).toBe(false);
    });
  });

  describe("OPEN policy", () => {
    let open: IAuthorizationService;

    beforeEach(() => {
      open = createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      });
    });

    it("treats everyone (incl. anonymous) as a supreme admin", () => {
      expect(open.isSupremeAdmin(undefined)).toBe(true);
      expect(open.isSupremeAdmin("0xanyone")).toBe(true);
    });

    it("allows every decision without touching a permission store", async () => {
      expect(open.canCreate(undefined)).toBe(true);
      expect(await open.canRead("doc-1", undefined)).toBe(true);
      expect(await open.canWrite("doc-1", undefined)).toBe(true);
      expect(await open.canManage("doc-1", undefined)).toBe(true);
      expect(await open.canMutate("doc-1", "OP", undefined)).toBe(true);
    });
  });

  describe("ADMIN_ONLY policy", () => {
    let adminOnly: IAuthorizationService;

    beforeEach(() => {
      adminOnly = createAuthorizationService({
        admins: ["0xadmin"],
        defaultProtection: false,
        policy: AuthorizationPolicy.ADMIN_ONLY,
      });
    });

    it("allows supreme admins everything", async () => {
      expect(adminOnly.canCreate("0xadmin")).toBe(true);
      expect(await adminOnly.canRead("doc-1", "0xadmin")).toBe(true);
      expect(await adminOnly.canWrite("doc-1", "0xadmin")).toBe(true);
      expect(await adminOnly.canManage("doc-1", "0xadmin")).toBe(true);
      expect(await adminOnly.canMutate("doc-1", "OP", "0xadmin")).toBe(true);
    });

    it("denies non-admins and anonymous everything", async () => {
      expect(adminOnly.canCreate("0xuser")).toBe(false);
      expect(adminOnly.canCreate(undefined)).toBe(false);
      expect(await adminOnly.canRead("doc-1", "0xuser")).toBe(false);
      expect(await adminOnly.canWrite("doc-1", "0xuser")).toBe(false);
      expect(await adminOnly.canManage("doc-1", "0xuser")).toBe(false);
      expect(await adminOnly.canMutate("doc-1", "OP", "0xuser")).toBe(false);
      expect(await adminOnly.canRead("doc-1", undefined)).toBe(false);
      expect(await adminOnly.canWrite("doc-1", undefined)).toBe(false);
    });
  });

  describe("factory invariants", () => {
    it("throws for DOCUMENT_PERMISSIONS policy without a permission service", () => {
      expect(() =>
        createAuthorizationService({
          admins: [],
          defaultProtection: false,
          policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
        }),
      ).toThrow(/DocumentPermissionService is required/);
    });

    it("throws for DOCUMENT_PERMISSIONS policy without a parent resolver", () => {
      expect(() =>
        createAuthorizationService(
          {
            admins: [],
            defaultProtection: false,
            policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
          },
          mockPermissionService as DocumentPermissionService,
        ),
      ).toThrow(/getParentIds resolver is required/);
    });
  });
});
