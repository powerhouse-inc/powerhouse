import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationService } from "../src/services/authorization.service.js";
import type { DocumentPermissionService } from "../src/services/document-permission.service.js";

describe("AuthorizationService", () => {
  let service: AuthorizationService;
  let mockPermissionService: Partial<DocumentPermissionService>;
  const getParentIds = vi.fn().mockResolvedValue([]);

  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissionService = {
      isDocumentProtected: vi.fn().mockResolvedValue(false),
      isProtectedWithAncestors: vi.fn().mockResolvedValue(false),
      getDocumentOwner: vi.fn().mockResolvedValue(null),
      canRead: vi.fn().mockResolvedValue(false),
      canWrite: vi.fn().mockResolvedValue(false),
      canReadDocument: vi.fn().mockResolvedValue(false),
      canWriteDocument: vi.fn().mockResolvedValue(false),
      canManageDocument: vi.fn().mockResolvedValue(false),
      isOperationRestricted: vi.fn().mockResolvedValue(false),
      canExecuteOperation: vi.fn().mockResolvedValue(false),
    };
    service = new AuthorizationService(
      mockPermissionService as DocumentPermissionService,
      { admins: ["0xadmin"], defaultProtection: false },
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

  describe("canRead", () => {
    it("should allow supreme admin", async () => {
      const result = await service.canRead("doc-1", "0xadmin");
      expect(result).toBe(true);
      expect(mockPermissionService.isDocumentProtected).not.toHaveBeenCalled();
    });

    it("should allow anonymous read on unprotected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        false,
      );
      const result = await service.canRead("doc-1", undefined);
      expect(result).toBe(true);
    });

    it("should allow authenticated read on unprotected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        false,
      );
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should deny anonymous read on protected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        true,
      );
      const result = await service.canRead("doc-1", undefined);
      expect(result).toBe(false);
    });

    it("should allow owner read on protected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        "0xowner",
      );
      const result = await service.canRead("doc-1", "0xowner");
      expect(result).toBe(true);
    });

    it("should check grants for protected document when user is not owner", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        "0xother",
      );
      vi.mocked(mockPermissionService.canReadDocument!).mockResolvedValue(true);
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(true);
      expect(mockPermissionService.canReadDocument).toHaveBeenCalledWith(
        "doc-1",
        "0xuser",
      );
    });

    it("should deny read when no grant on protected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        null,
      );
      vi.mocked(mockPermissionService.canReadDocument!).mockResolvedValue(
        false,
      );
      const result = await service.canRead("doc-1", "0xuser");
      expect(result).toBe(false);
    });

    it("should use hierarchy check when getParentIds is provided", async () => {
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        null,
      );
      vi.mocked(mockPermissionService.canRead!).mockResolvedValue(true);
      const result = await service.canRead("doc-1", "0xuser", getParentIds);
      expect(result).toBe(true);
      expect(
        mockPermissionService.isProtectedWithAncestors,
      ).toHaveBeenCalledWith("doc-1", getParentIds);
      expect(mockPermissionService.canRead).toHaveBeenCalledWith(
        "doc-1",
        "0xuser",
        getParentIds,
      );
    });
  });

  describe("canWrite", () => {
    it("should allow supreme admin", async () => {
      const result = await service.canWrite("doc-1", "0xadmin");
      expect(result).toBe(true);
    });

    it("should deny anonymous write even on unprotected document", async () => {
      const result = await service.canWrite("doc-1", undefined);
      expect(result).toBe(false);
    });

    it("should allow authenticated write on unprotected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        false,
      );
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should deny authenticated write on protected document without grant", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        null,
      );
      vi.mocked(mockPermissionService.canWriteDocument!).mockResolvedValue(
        false,
      );
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(false);
    });

    it("should allow owner write on protected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        "0xowner",
      );
      const result = await service.canWrite("doc-1", "0xowner");
      expect(result).toBe(true);
    });

    it("should allow write with WRITE grant on protected document", async () => {
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        null,
      );
      vi.mocked(mockPermissionService.canWriteDocument!).mockResolvedValue(
        true,
      );
      const result = await service.canWrite("doc-1", "0xuser");
      expect(result).toBe(true);
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

    it("should allow user with ADMIN grant", async () => {
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        null,
      );
      vi.mocked(mockPermissionService.canManageDocument!).mockResolvedValue(
        true,
      );
      const result = await service.canManage("doc-1", "0xuser");
      expect(result).toBe(true);
    });

    it("should deny user without ADMIN grant", async () => {
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        null,
      );
      vi.mocked(mockPermissionService.canManageDocument!).mockResolvedValue(
        false,
      );
      const result = await service.canManage("doc-1", "0xuser");
      expect(result).toBe(false);
    });
  });

  describe("canExecuteOperation", () => {
    it("should allow supreme admin", async () => {
      const result = await service.canExecuteOperation(
        "doc-1",
        "SET_NAME",
        "0xadmin",
      );
      expect(result).toBe(true);
    });

    it("should fall through to write check for unrestricted operations", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        false,
      );
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        false,
      );
      const result = await service.canExecuteOperation(
        "doc-1",
        "SET_NAME",
        "0xuser",
      );
      expect(result).toBe(true); // unprotected + authenticated = write allowed
    });

    it("should check operation grant for restricted operations", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.canExecuteOperation!).mockResolvedValue(
        true,
      );
      const result = await service.canExecuteOperation(
        "doc-1",
        "SPECIAL_OP",
        "0xuser",
      );
      expect(result).toBe(true);
      expect(mockPermissionService.canExecuteOperation).toHaveBeenCalledWith(
        "doc-1",
        "SPECIAL_OP",
        "0xuser",
      );
    });

    it("should deny when restricted and no operation grant", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.canExecuteOperation!).mockResolvedValue(
        false,
      );
      const result = await service.canExecuteOperation(
        "doc-1",
        "SPECIAL_OP",
        "0xuser",
      );
      expect(result).toBe(false);
    });
  });

  describe("canMutate", () => {
    it("should allow supreme admin", async () => {
      const result = await service.canMutate("doc-1", "SET_NAME", "0xadmin");
      expect(result).toBe(true);
    });

    it("should allow write for unrestricted operations", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        false,
      );
      vi.mocked(mockPermissionService.isDocumentProtected!).mockResolvedValue(
        false,
      );
      const result = await service.canMutate("doc-1", "SET_NAME", "0xuser");
      expect(result).toBe(true);
    });

    it("should allow READ-only user with operation grant for restricted ops", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.canExecuteOperation!).mockResolvedValue(
        true,
      );
      // Even if user only has READ permission, the operation grant should suffice
      const result = await service.canMutate(
        "doc-1",
        "SPECIAL_OP",
        "0xreadonly",
      );
      expect(result).toBe(true);
    });

    it("should deny when restricted and no operation grant", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.canExecuteOperation!).mockResolvedValue(
        false,
      );
      const result = await service.canMutate("doc-1", "SPECIAL_OP", "0xuser");
      expect(result).toBe(false);
    });

    it("should deny anonymous for unrestricted operations", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        false,
      );
      const result = await service.canMutate("doc-1", "SET_NAME", undefined);
      expect(result).toBe(false);
    });
  });

  describe("Address normalization", () => {
    it("should normalize address in canExecuteOperation for restricted ops", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.canExecuteOperation!).mockResolvedValue(
        true,
      );
      await service.canExecuteOperation("doc-1", "SPECIAL_OP", "0xMixedCase");
      expect(mockPermissionService.canExecuteOperation).toHaveBeenCalledWith(
        "doc-1",
        "SPECIAL_OP",
        "0xmixedcase",
      );
    });

    it("should normalize address in canMutate for restricted ops", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.canExecuteOperation!).mockResolvedValue(
        true,
      );
      await service.canMutate("doc-1", "SPECIAL_OP", "0xMixedCase");
      expect(mockPermissionService.canExecuteOperation).toHaveBeenCalledWith(
        "doc-1",
        "SPECIAL_OP",
        "0xmixedcase",
      );
    });

    it("should handle undefined address in canExecuteOperation", async () => {
      vi.mocked(mockPermissionService.isOperationRestricted!).mockResolvedValue(
        true,
      );
      vi.mocked(mockPermissionService.canExecuteOperation!).mockResolvedValue(
        false,
      );
      const result = await service.canExecuteOperation(
        "doc-1",
        "SPECIAL_OP",
        undefined,
      );
      expect(result).toBe(false);
      expect(mockPermissionService.canExecuteOperation).toHaveBeenCalledWith(
        "doc-1",
        "SPECIAL_OP",
        undefined,
      );
    });
  });

  describe("Protection inheritance", () => {
    it("should treat document as protected when parent is protected", async () => {
      // Document itself is not protected, but parent is
      vi.mocked(
        mockPermissionService.isProtectedWithAncestors!,
      ).mockResolvedValue(true);
      vi.mocked(mockPermissionService.getDocumentOwner!).mockResolvedValue(
        null,
      );
      vi.mocked(mockPermissionService.canRead!).mockResolvedValue(false);

      const result = await service.canRead("doc-1", "0xuser", getParentIds);
      expect(result).toBe(false);
      expect(
        mockPermissionService.isProtectedWithAncestors,
      ).toHaveBeenCalledWith("doc-1", getParentIds);
    });
  });
});
