import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrations/index.js";
import { DocumentPermissionService } from "../src/services/document-permission.service.js";
import type { DocumentPermissionDatabase } from "../src/utils/db.js";
import { getDbClient } from "../src/utils/db.js";

describe("DocumentPermissionService", () => {
  let service: DocumentPermissionService;
  let db: Kysely<DocumentPermissionDatabase>;

  beforeEach(async () => {
    // Create in-memory PGlite database for testing
    const { db: dbClient } = getDbClient();
    db = dbClient as Kysely<DocumentPermissionDatabase>;
    await runMigrations(db as Kysely<unknown>);
    service = new DocumentPermissionService(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe("User Permissions", () => {
    const documentId = "doc-123";
    const userAddress = "0xUser1";
    const adminAddress = "0xAdmin";

    describe("grantPermission", () => {
      it("should grant READ permission to a user", async () => {
        const result = await service.grantPermission(
          documentId,
          userAddress,
          "READ",
          adminAddress,
        );

        expect(result.documentId).toBe(documentId);
        expect(result.userAddress).toBe(userAddress.toLowerCase());
        expect(result.permission).toBe("READ");
        expect(result.grantedBy).toBe(adminAddress.toLowerCase());
      });

      it("should grant WRITE permission to a user", async () => {
        const result = await service.grantPermission(
          documentId,
          userAddress,
          "WRITE",
          adminAddress,
        );

        expect(result.permission).toBe("WRITE");
      });

      it("should grant ADMIN permission to a user", async () => {
        const result = await service.grantPermission(
          documentId,
          userAddress,
          "ADMIN",
          adminAddress,
        );

        expect(result.permission).toBe("ADMIN");
      });

      it("should update permission when granting to same user", async () => {
        await service.grantPermission(
          documentId,
          userAddress,
          "READ",
          adminAddress,
        );
        const result = await service.grantPermission(
          documentId,
          userAddress,
          "WRITE",
          adminAddress,
        );

        expect(result.permission).toBe("WRITE");

        const permissions = await service.getDocumentPermissions(documentId);
        expect(permissions).toHaveLength(1);
      });

      it("should normalize user addresses to lowercase", async () => {
        const result = await service.grantPermission(
          documentId,
          "0xABCDEF",
          "READ",
          "0xGRANTER",
        );

        expect(result.userAddress).toBe("0xabcdef");
        expect(result.grantedBy).toBe("0xgranter");
      });
    });

    describe("getUserPermission", () => {
      it("should return null when no permission exists", async () => {
        const result = await service.getUserPermission(documentId, userAddress);
        expect(result).toBeNull();
      });

      it("should return the permission level when it exists", async () => {
        await service.grantPermission(
          documentId,
          userAddress,
          "WRITE",
          adminAddress,
        );

        const result = await service.getUserPermission(documentId, userAddress);
        expect(result).toBe("WRITE");
      });

      it("should be case-insensitive for user addresses", async () => {
        await service.grantPermission(
          documentId,
          "0xabc",
          "READ",
          adminAddress,
        );

        const result = await service.getUserPermission(documentId, "0xABC");
        expect(result).toBe("READ");
      });
    });

    describe("revokePermission", () => {
      it("should remove a user's permission", async () => {
        await service.grantPermission(
          documentId,
          userAddress,
          "READ",
          adminAddress,
        );
        await service.revokePermission(documentId, userAddress);

        const result = await service.getUserPermission(documentId, userAddress);
        expect(result).toBeNull();
      });

      it("should not fail when revoking non-existent permission", async () => {
        await expect(
          service.revokePermission(documentId, userAddress),
        ).resolves.not.toThrow();
      });
    });

    describe("getDocumentPermissions", () => {
      it("should return empty array when no permissions exist", async () => {
        const result = await service.getDocumentPermissions(documentId);
        expect(result).toEqual([]);
      });

      it("should return all permissions for a document", async () => {
        await service.grantPermission(
          documentId,
          "0xuser1",
          "READ",
          adminAddress,
        );
        await service.grantPermission(
          documentId,
          "0xuser2",
          "WRITE",
          adminAddress,
        );
        await service.grantPermission(
          documentId,
          "0xuser3",
          "ADMIN",
          adminAddress,
        );

        const result = await service.getDocumentPermissions(documentId);
        expect(result).toHaveLength(3);
      });
    });

    describe("getUserDocuments", () => {
      it("should return all documents a user has access to", async () => {
        await service.grantPermission(
          "doc-1",
          userAddress,
          "READ",
          adminAddress,
        );
        await service.grantPermission(
          "doc-2",
          userAddress,
          "WRITE",
          adminAddress,
        );
        await service.grantPermission(
          "doc-3",
          "0xOtherUser",
          "READ",
          adminAddress,
        );

        const result = await service.getUserDocuments(userAddress);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.documentId).sort()).toEqual([
          "doc-1",
          "doc-2",
        ]);
      });
    });
  });

  describe("Access Control Checks", () => {
    const documentId = "doc-123";
    const adminAddress = "0xAdmin";

    describe("canReadDocument", () => {
      it("should return false for undefined user", async () => {
        const result = await service.canReadDocument(documentId, undefined);
        expect(result).toBe(false);
      });

      it("should return false when user has no permission", async () => {
        const result = await service.canReadDocument(documentId, "0xunknown");
        expect(result).toBe(false);
      });

      it("should return true when user has READ permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "READ",
          adminAddress,
        );
        const result = await service.canReadDocument(documentId, "0xuser");
        expect(result).toBe(true);
      });

      it("should return true when user has WRITE permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "WRITE",
          adminAddress,
        );
        const result = await service.canReadDocument(documentId, "0xuser");
        expect(result).toBe(true);
      });

      it("should return true when user has ADMIN permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "ADMIN",
          adminAddress,
        );
        const result = await service.canReadDocument(documentId, "0xuser");
        expect(result).toBe(true);
      });
    });

    describe("canWriteDocument", () => {
      it("should return false for undefined user", async () => {
        const result = await service.canWriteDocument(documentId, undefined);
        expect(result).toBe(false);
      });

      it("should return false when user has no permission", async () => {
        const result = await service.canWriteDocument(documentId, "0xunknown");
        expect(result).toBe(false);
      });

      it("should return false when user has only READ permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "READ",
          adminAddress,
        );
        const result = await service.canWriteDocument(documentId, "0xuser");
        expect(result).toBe(false);
      });

      it("should return true when user has WRITE permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "WRITE",
          adminAddress,
        );
        const result = await service.canWriteDocument(documentId, "0xuser");
        expect(result).toBe(true);
      });

      it("should return true when user has ADMIN permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "ADMIN",
          adminAddress,
        );
        const result = await service.canWriteDocument(documentId, "0xuser");
        expect(result).toBe(true);
      });
    });

    describe("canManageDocument", () => {
      it("should return false for undefined user", async () => {
        const result = await service.canManageDocument(documentId, undefined);
        expect(result).toBe(false);
      });

      it("should return false when user has only READ permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "READ",
          adminAddress,
        );
        const result = await service.canManageDocument(documentId, "0xuser");
        expect(result).toBe(false);
      });

      it("should return false when user has only WRITE permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "WRITE",
          adminAddress,
        );
        const result = await service.canManageDocument(documentId, "0xuser");
        expect(result).toBe(false);
      });

      it("should return true when user has ADMIN permission", async () => {
        await service.grantPermission(
          documentId,
          "0xuser",
          "ADMIN",
          adminAddress,
        );
        const result = await service.canManageDocument(documentId, "0xuser");
        expect(result).toBe(true);
      });
    });
  });

  describe("Permission Inheritance (canRead/canWrite with parent hierarchy)", () => {
    const adminAddress = "0xAdmin";
    const userAddress = "0xUser";

    // Simple parent hierarchy for testing
    const parentHierarchy: Record<string, string[]> = {
      "child-doc": ["parent-doc"],
      "grandchild-doc": ["child-doc"],
      "parent-doc": [],
      "orphan-doc": [],
    };

    const getParentIds = async (documentId: string): Promise<string[]> => {
      return parentHierarchy[documentId] ?? [];
    };

    describe("canRead", () => {
      it("should return true when user has direct permission", async () => {
        await service.grantPermission(
          "child-doc",
          userAddress,
          "READ",
          adminAddress,
        );

        const result = await service.canRead(
          "child-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(true);
      });

      it("should return true when user has permission on parent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "READ",
          adminAddress,
        );

        const result = await service.canRead(
          "child-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(true);
      });

      it("should return true when user has permission on grandparent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "READ",
          adminAddress,
        );

        const result = await service.canRead(
          "grandchild-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(true);
      });

      it("should return false when user has no permission in hierarchy", async () => {
        const result = await service.canRead(
          "child-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(false);
      });

      it("should return false for orphan document without direct permission", async () => {
        const result = await service.canRead(
          "orphan-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(false);
      });
    });

    describe("canWrite", () => {
      it("should return true when user has direct write permission", async () => {
        await service.grantPermission(
          "child-doc",
          userAddress,
          "WRITE",
          adminAddress,
        );

        const result = await service.canWrite(
          "child-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(true);
      });

      it("should return false when user has only READ permission on parent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "READ",
          adminAddress,
        );

        const result = await service.canWrite(
          "child-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(false);
      });

      it("should return true when user has WRITE permission on parent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "WRITE",
          adminAddress,
        );

        const result = await service.canWrite(
          "child-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(true);
      });

      it("should return true when user has ADMIN permission on grandparent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "ADMIN",
          adminAddress,
        );

        const result = await service.canWrite(
          "grandchild-doc",
          userAddress,
          getParentIds,
        );
        expect(result).toBe(true);
      });
    });

    describe("filterReadableDocuments", () => {
      it("should filter documents based on permissions", async () => {
        await service.grantPermission(
          "doc-1",
          userAddress,
          "READ",
          adminAddress,
        );
        await service.grantPermission(
          "doc-3",
          userAddress,
          "WRITE",
          adminAddress,
        );

        const result = await service.filterReadableDocuments(
          ["doc-1", "doc-2", "doc-3", "doc-4"],
          userAddress,
          async () => [], // No parent hierarchy
        );

        expect(result).toEqual(["doc-1", "doc-3"]);
      });

      it("should include documents accessible via parent hierarchy", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "READ",
          adminAddress,
        );

        const result = await service.filterReadableDocuments(
          ["child-doc", "orphan-doc"],
          userAddress,
          getParentIds,
        );

        expect(result).toEqual(["child-doc"]);
      });
    });
  });

  describe("Group Management", () => {
    describe("createGroup", () => {
      it("should create a group with name and description", async () => {
        const result = await service.createGroup(
          "Editors",
          "Can edit documents",
        );

        expect(result.name).toBe("Editors");
        expect(result.description).toBe("Can edit documents");
        expect(result.id).toBeDefined();
      });

      it("should create a group without description", async () => {
        const result = await service.createGroup("Viewers");

        expect(result.name).toBe("Viewers");
        expect(result.description).toBeNull();
      });
    });

    describe("getGroup", () => {
      it("should return null for non-existent group", async () => {
        const result = await service.getGroup(999);
        expect(result).toBeNull();
      });

      it("should return group by ID", async () => {
        const created = await service.createGroup("Test Group");
        const result = await service.getGroup(created.id);

        expect(result?.name).toBe("Test Group");
      });
    });

    describe("listGroups", () => {
      it("should return all groups", async () => {
        await service.createGroup("Group1");
        await service.createGroup("Group2");
        await service.createGroup("Group3");

        const result = await service.listGroups();
        expect(result).toHaveLength(3);
      });
    });

    describe("deleteGroup", () => {
      it("should delete group and all associations", async () => {
        const group = await service.createGroup("ToDelete");
        await service.addUserToGroup("0xuser", group.id);
        await service.grantGroupPermission(
          "doc-1",
          group.id,
          "READ",
          "0xadmin",
        );

        await service.deleteGroup(group.id);

        const result = await service.getGroup(group.id);
        expect(result).toBeNull();

        const userGroups = await service.getUserGroups("0xuser");
        expect(userGroups).toHaveLength(0);
      });
    });

    describe("User-Group membership", () => {
      it("should add user to group", async () => {
        const group = await service.createGroup("Editors");
        await service.addUserToGroup("0xuser", group.id);

        const userGroups = await service.getUserGroups("0xuser");
        expect(userGroups).toHaveLength(1);
        expect(userGroups[0].name).toBe("Editors");
      });

      it("should remove user from group", async () => {
        const group = await service.createGroup("Editors");
        await service.addUserToGroup("0xuser", group.id);
        await service.removeUserFromGroup("0xuser", group.id);

        const userGroups = await service.getUserGroups("0xuser");
        expect(userGroups).toHaveLength(0);
      });

      it("should get group members", async () => {
        const group = await service.createGroup("Editors");
        await service.addUserToGroup("0xuser1", group.id);
        await service.addUserToGroup("0xuser2", group.id);

        const members = await service.getGroupMembers(group.id);
        expect(members.sort()).toEqual(["0xuser1", "0xuser2"]);
      });

      it("should normalize user addresses in group membership", async () => {
        const group = await service.createGroup("Test");
        await service.addUserToGroup("0xABCDEF", group.id);

        const members = await service.getGroupMembers(group.id);
        expect(members).toEqual(["0xabcdef"]);
      });
    });
  });

  describe("Group Document Permissions", () => {
    const adminAddress = "0xAdmin";
    const documentId = "doc-123";

    it("should grant group permission on document", async () => {
      const group = await service.createGroup("Editors");
      const result = await service.grantGroupPermission(
        documentId,
        group.id,
        "WRITE",
        adminAddress,
      );

      expect(result.documentId).toBe(documentId);
      expect(result.groupId).toBe(group.id);
      expect(result.permission).toBe("WRITE");
    });

    it("should allow user to read via group permission", async () => {
      const group = await service.createGroup("Readers");
      await service.addUserToGroup("0xuser", group.id);
      await service.grantGroupPermission(
        documentId,
        group.id,
        "READ",
        adminAddress,
      );

      const result = await service.canReadDocument(documentId, "0xuser");
      expect(result).toBe(true);
    });

    it("should allow user to write via group permission", async () => {
      const group = await service.createGroup("Writers");
      await service.addUserToGroup("0xuser", group.id);
      await service.grantGroupPermission(
        documentId,
        group.id,
        "WRITE",
        adminAddress,
      );

      const result = await service.canWriteDocument(documentId, "0xuser");
      expect(result).toBe(true);
    });

    it("should return highest group permission level", async () => {
      const readersGroup = await service.createGroup("Readers");
      const writersGroup = await service.createGroup("Writers");

      await service.addUserToGroup("0xuser", readersGroup.id);
      await service.addUserToGroup("0xuser", writersGroup.id);

      await service.grantGroupPermission(
        documentId,
        readersGroup.id,
        "READ",
        adminAddress,
      );
      await service.grantGroupPermission(
        documentId,
        writersGroup.id,
        "WRITE",
        adminAddress,
      );

      const groupPermission = await service.getUserGroupPermission(
        documentId,
        "0xuser",
      );
      expect(groupPermission).toBe("WRITE");
    });

    it("should revoke group permission", async () => {
      const group = await service.createGroup("TempGroup");
      await service.addUserToGroup("0xuser", group.id);
      await service.grantGroupPermission(
        documentId,
        group.id,
        "READ",
        adminAddress,
      );

      await service.revokeGroupPermission(documentId, group.id);

      const result = await service.canReadDocument(documentId, "0xuser");
      expect(result).toBe(false);
    });
  });

  describe("Operation Permissions", () => {
    const documentId = "doc-123";
    const operationType = "SET_NAME";
    const adminAddress = "0xAdmin";

    describe("User operation permissions", () => {
      it("should grant operation permission to user", async () => {
        const result = await service.grantOperationPermission(
          documentId,
          operationType,
          "0xuser",
          adminAddress,
        );

        expect(result.documentId).toBe(documentId);
        expect(result.operationType).toBe(operationType);
        expect(result.userAddress).toBe("0xuser");
      });

      it("should check if user can execute operation", async () => {
        await service.grantOperationPermission(
          documentId,
          operationType,
          "0xuser",
          adminAddress,
        );

        const result = await service.canExecuteOperation(
          documentId,
          operationType,
          "0xuser",
        );
        expect(result).toBe(true);
      });

      it("should return false when user has no operation permission", async () => {
        const result = await service.canExecuteOperation(
          documentId,
          operationType,
          "0xunknown",
        );
        expect(result).toBe(false);
      });

      it("should revoke operation permission", async () => {
        await service.grantOperationPermission(
          documentId,
          operationType,
          "0xuser",
          adminAddress,
        );
        await service.revokeOperationPermission(
          documentId,
          operationType,
          "0xuser",
        );

        const result = await service.canExecuteOperation(
          documentId,
          operationType,
          "0xuser",
        );
        expect(result).toBe(false);
      });
    });

    describe("Group operation permissions", () => {
      it("should grant operation permission to group", async () => {
        const group = await service.createGroup("Operators");
        const result = await service.grantGroupOperationPermission(
          documentId,
          operationType,
          group.id,
          adminAddress,
        );

        expect(result.documentId).toBe(documentId);
        expect(result.operationType).toBe(operationType);
        expect(result.groupId).toBe(group.id);
      });

      it("should allow user to execute operation via group", async () => {
        const group = await service.createGroup("Operators");
        await service.addUserToGroup("0xuser", group.id);
        await service.grantGroupOperationPermission(
          documentId,
          operationType,
          group.id,
          adminAddress,
        );

        const result = await service.canExecuteOperation(
          documentId,
          operationType,
          "0xuser",
        );
        expect(result).toBe(true);
      });

      it("should revoke group operation permission", async () => {
        const group = await service.createGroup("TempOps");
        await service.addUserToGroup("0xuser", group.id);
        await service.grantGroupOperationPermission(
          documentId,
          operationType,
          group.id,
          adminAddress,
        );

        await service.revokeGroupOperationPermission(
          documentId,
          operationType,
          group.id,
        );

        const result = await service.canExecuteOperation(
          documentId,
          operationType,
          "0xuser",
        );
        expect(result).toBe(false);
      });
    });

    describe("isOperationRestricted", () => {
      it("should return false when no permissions are set", async () => {
        const result = await service.isOperationRestricted(
          documentId,
          operationType,
        );
        expect(result).toBe(false);
      });

      it("should return true when user permission is set", async () => {
        await service.grantOperationPermission(
          documentId,
          operationType,
          "0xuser",
          adminAddress,
        );

        const result = await service.isOperationRestricted(
          documentId,
          operationType,
        );
        expect(result).toBe(true);
      });

      it("should return true when group permission is set", async () => {
        const group = await service.createGroup("Operators");
        await service.grantGroupOperationPermission(
          documentId,
          operationType,
          group.id,
          adminAddress,
        );

        const result = await service.isOperationRestricted(
          documentId,
          operationType,
        );
        expect(result).toBe(true);
      });
    });
  });

  describe("Delete All Document Permissions", () => {
    it("should delete all permissions for a document", async () => {
      const documentId = "doc-to-delete";
      const adminAddress = "0xAdmin";

      // Create various permissions
      await service.grantPermission(
        documentId,
        "0xuser1",
        "READ",
        adminAddress,
      );
      await service.grantPermission(
        documentId,
        "0xuser2",
        "WRITE",
        adminAddress,
      );

      const group = await service.createGroup("TestGroup");
      await service.grantGroupPermission(
        documentId,
        group.id,
        "READ",
        adminAddress,
      );

      await service.grantOperationPermission(
        documentId,
        "SET_NAME",
        "0xuser1",
        adminAddress,
      );
      await service.grantGroupOperationPermission(
        documentId,
        "SET_NAME",
        group.id,
        adminAddress,
      );

      // Delete all permissions
      await service.deleteAllDocumentPermissions(documentId);

      // Verify all permissions are gone
      const userPermissions = await service.getDocumentPermissions(documentId);
      expect(userPermissions).toHaveLength(0);

      const groupPermissions =
        await service.getDocumentGroupPermissions(documentId);
      expect(groupPermissions).toHaveLength(0);

      const opUserPerms = await service.getOperationUserPermissions(
        documentId,
        "SET_NAME",
      );
      expect(opUserPerms).toHaveLength(0);

      const opGroupPerms = await service.getOperationGroupPermissions(
        documentId,
        "SET_NAME",
      );
      expect(opGroupPerms).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty user address for canExecuteOperation", async () => {
      const result = await service.canExecuteOperation("doc", "op", undefined);
      expect(result).toBe(false);
    });

    it("should handle duplicate group membership gracefully", async () => {
      const group = await service.createGroup("Test");
      await service.addUserToGroup("0xuser", group.id);
      await service.addUserToGroup("0xuser", group.id); // Duplicate

      const members = await service.getGroupMembers(group.id);
      expect(members).toHaveLength(1);
    });
  });
});
