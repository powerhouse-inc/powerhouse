import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrations/index.js";
import type {
  CanonicalDocumentId,
  IAuthorizationService,
} from "../src/services/authorization.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
} from "../src/services/authorization.service.js";
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

  describe("Authorization decisions over the data layer", () => {
    const adminAddress = "0xAdmin";
    const userAddress = "0xUser";

    // Simple parent hierarchy for testing
    const parentHierarchy: Record<string, string[]> = {
      "child-doc": ["parent-doc"],
      "grandchild-doc": ["child-doc"],
      "parent-doc": [],
      "orphan-doc": [],
    };

    const getParentIds = (documentId: string): Promise<string[]> => {
      return Promise.resolve(parentHierarchy[documentId] ?? []);
    };

    let authorization: IAuthorizationService;

    beforeEach(() => {
      // Protect everything by default so grant checks are actually exercised.
      const protectedService = new DocumentPermissionService(db, {
        defaultProtection: true,
      });
      authorization = createAuthorizationService(
        {
          admins: [],
          defaultProtection: true,
          policy: AuthorizationPolicy.DOCUMENT_PERMISSIONS,
        },
        protectedService,
        getParentIds,
      );
    });

    describe("grant levels", () => {
      it.each(["READ", "WRITE", "ADMIN"] as const)(
        "%s grant allows reading",
        async (level) => {
          await service.grantPermission(
            "orphan-doc",
            userAddress,
            level,
            adminAddress,
          );
          expect(
            await authorization.canRead(
              "orphan-doc" as CanonicalDocumentId,
              userAddress,
            ),
          ).toBe(true);
        },
      );

      it("should deny read for undefined user", async () => {
        expect(
          await authorization.canRead(
            "orphan-doc" as CanonicalDocumentId,
            undefined,
          ),
        ).toBe(false);
      });

      it("should deny read when user has no permission", async () => {
        expect(
          await authorization.canRead(
            "orphan-doc" as CanonicalDocumentId,
            "0xunknown",
          ),
        ).toBe(false);
      });

      it("should deny write with only a READ grant", async () => {
        await service.grantPermission(
          "orphan-doc",
          userAddress,
          "READ",
          adminAddress,
        );
        expect(
          await authorization.canWrite(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(false);
      });

      it.each(["WRITE", "ADMIN"] as const)(
        "%s grant allows writing",
        async (level) => {
          await service.grantPermission(
            "orphan-doc",
            userAddress,
            level,
            adminAddress,
          );
          expect(
            await authorization.canWrite(
              "orphan-doc" as CanonicalDocumentId,
              userAddress,
            ),
          ).toBe(true);
        },
      );

      it.each(["READ", "WRITE"] as const)(
        "%s grant does not allow managing",
        async (level) => {
          await service.grantPermission(
            "orphan-doc",
            userAddress,
            level,
            adminAddress,
          );
          expect(
            await authorization.canManage(
              "orphan-doc" as CanonicalDocumentId,
              userAddress,
            ),
          ).toBe(false);
        },
      );

      it("ADMIN grant allows managing", async () => {
        await service.grantPermission(
          "orphan-doc",
          userAddress,
          "ADMIN",
          adminAddress,
        );
        expect(
          await authorization.canManage(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
      });

      it("group grant allows reading and writing", async () => {
        const group = await service.createGroup("Writers");
        await service.addUserToGroup(userAddress, group.id);
        await service.grantGroupPermission(
          "orphan-doc",
          group.id,
          "WRITE",
          adminAddress,
        );
        expect(
          await authorization.canRead(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
        expect(
          await authorization.canWrite(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
      });

      it("revoking a group grant revokes the access it conferred", async () => {
        const group = await service.createGroup("Revocable");
        await service.addUserToGroup(userAddress, group.id);
        await service.grantGroupPermission(
          "orphan-doc",
          group.id,
          "WRITE",
          adminAddress,
        );
        expect(
          await authorization.canWrite(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);

        await service.revokeGroupPermission("orphan-doc", group.id);

        expect(
          await authorization.canRead(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(false);
        expect(
          await authorization.canWrite(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(false);
      });
    });

    describe("permission inheritance", () => {
      it("should allow read with a grant on the parent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "READ",
          adminAddress,
        );
        expect(
          await authorization.canRead(
            "child-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
      });

      it("should allow read with a grant on the grandparent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "READ",
          adminAddress,
        );
        expect(
          await authorization.canRead(
            "grandchild-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
      });

      it("should deny read without any grant in the hierarchy", async () => {
        expect(
          await authorization.canRead(
            "child-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(false);
      });

      it("should not satisfy write via an inherited READ grant", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "READ",
          adminAddress,
        );
        expect(
          await authorization.canWrite(
            "child-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(false);
      });

      it("should allow write with a WRITE grant on the parent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "WRITE",
          adminAddress,
        );
        expect(
          await authorization.canWrite(
            "child-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
      });

      it("should allow write with an ADMIN grant on the grandparent", async () => {
        await service.grantPermission(
          "parent-doc",
          userAddress,
          "ADMIN",
          adminAddress,
        );
        expect(
          await authorization.canWrite(
            "grandchild-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
      });
    });

    describe("owner and restricted operations", () => {
      it("should allow the owner everything on their document", async () => {
        await service.initializeDocumentProtection("orphan-doc", userAddress);
        expect(
          await authorization.canRead(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
        expect(
          await authorization.canWrite(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
        expect(
          await authorization.canManage(
            "orphan-doc" as CanonicalDocumentId,
            userAddress,
          ),
        ).toBe(true);
      });

      it("should allow a restricted operation only with an operation grant", async () => {
        await service.grantPermission(
          "orphan-doc",
          userAddress,
          "WRITE",
          adminAddress,
        );
        await service.grantOperationPermission(
          "orphan-doc",
          "SPECIAL_OP",
          "0xoperator",
          adminAddress,
        );

        expect(
          await authorization.canMutate(
            "orphan-doc" as CanonicalDocumentId,
            "SPECIAL_OP",
            userAddress,
          ),
        ).toBe(false);
        expect(
          await authorization.canMutate(
            "orphan-doc" as CanonicalDocumentId,
            "SPECIAL_OP",
            "0xoperator",
          ),
        ).toBe(true);
      });

      it("should allow the owner to execute restricted operations", async () => {
        await service.initializeDocumentProtection("orphan-doc", userAddress);
        await service.grantOperationPermission(
          "orphan-doc",
          "SPECIAL_OP",
          "0xoperator",
          adminAddress,
        );

        expect(
          await authorization.canMutate(
            "orphan-doc" as CanonicalDocumentId,
            "SPECIAL_OP",
            userAddress,
          ),
        ).toBe(true);
      });

      it("should match operation grants case-insensitively through canMutate", async () => {
        await service.grantOperationPermission(
          "orphan-doc",
          "SPECIAL_OP",
          "0xoperator",
          adminAddress,
        );

        expect(
          await authorization.canMutate(
            "orphan-doc" as CanonicalDocumentId,
            "SPECIAL_OP",
            "0xOPERATOR",
          ),
        ).toBe(true);
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

    it("should surface a READ group grant for a member", async () => {
      const group = await service.createGroup("Readers");
      await service.addUserToGroup("0xuser", group.id);
      await service.grantGroupPermission(
        documentId,
        group.id,
        "READ",
        adminAddress,
      );

      const result = await service.getUserGroupPermission(documentId, "0xuser");
      expect(result).toBe("READ");
    });

    it("should surface a WRITE group grant for a member", async () => {
      const group = await service.createGroup("Writers");
      await service.addUserToGroup("0xuser", group.id);
      await service.grantGroupPermission(
        documentId,
        group.id,
        "WRITE",
        adminAddress,
      );

      const result = await service.getUserGroupPermission(documentId, "0xuser");
      expect(result).toBe("WRITE");
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

      const result = await service.getUserGroupPermission(documentId, "0xuser");
      expect(result).toBeNull();
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

      it("should report an operation grant for the user", async () => {
        await service.grantOperationPermission(
          documentId,
          operationType,
          "0xuser",
          adminAddress,
        );

        const result = await service.hasOperationGrant(
          documentId,
          operationType,
          "0xuser",
        );
        expect(result).toBe(true);
      });

      it("should return false when user has no operation permission", async () => {
        const result = await service.hasOperationGrant(
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

        const result = await service.hasOperationGrant(
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

        const result = await service.hasOperationGrant(
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

        const result = await service.hasOperationGrant(
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
    it("should handle duplicate group membership gracefully", async () => {
      const group = await service.createGroup("Test");
      await service.addUserToGroup("0xuser", group.id);
      await service.addUserToGroup("0xuser", group.id); // Duplicate

      const members = await service.getGroupMembers(group.id);
      expect(members).toHaveLength(1);
    });
  });
});
