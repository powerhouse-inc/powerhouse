import type { Kysely } from "kysely";
import { sql } from "kysely";
import type {
  DocumentPermissionDatabase,
  DocumentPermissionLevel,
} from "../utils/db.js";
import { runMigrations } from "../migrations/index.js";

export interface DocumentPermissionEntry {
  documentId: string;
  userAddress: string;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Group {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentGroupPermissionEntry {
  documentId: string;
  groupId: number;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationUserPermissionEntry {
  documentId: string;
  operationType: string;
  userAddress: string;
  grantedBy: string;
  createdAt: Date;
}

export interface OperationGroupPermissionEntry {
  documentId: string;
  operationType: string;
  groupId: number;
  grantedBy: string;
  createdAt: Date;
}

/**
 * Function type for getting parent document IDs
 * This is injected to avoid circular dependencies with the reactor client
 */
export type GetParentIdsFn = (documentId: string) => Promise<string[]>;

/**
 * Service for managing document-level permissions.
 *
 * Permission levels for documents:
 * - READ: Can fetch and read the document
 * - WRITE: Can push updates and modify the document
 * - ADMIN: Can manage document permissions and settings
 *
 * Operation permissions:
 * - Users and groups can be granted permission to execute specific operations
 *
 * Global roles (via environment variables):
 * - AUTH_ENABLED: Enables authorization checks
 * - ADMINS: Comma-separated list of admin addresses (full access)
 * - USERS: Comma-separated list of user addresses (read/write access)
 * - GUESTS: Comma-separated list of guest addresses (read access)
 */
export class DocumentPermissionService {
  private initialized = false;

  constructor(private readonly db: Kysely<DocumentPermissionDatabase>) {}

  /**
   * Initialize the database tables for document permissions by running migrations
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await runMigrations(this.db as Kysely<unknown>);

    this.initialized = true;
  }

  // ============================================
  // User Permission Operations
  // ============================================

  /**
   * Get the permission level for a user on a specific document.
   * Returns null if no permission is set.
   */
  async getUserPermission(
    documentId: string,
    userAddress: string,
  ): Promise<DocumentPermissionLevel | null> {
    const result = await this.db
      .selectFrom("DocumentPermission")
      .select("permission")
      .where("documentId", "=", documentId)
      .where("userAddress", "=", userAddress.toLowerCase())
      .executeTakeFirst();

    return result?.permission ?? null;
  }

  /**
   * Get all permissions for a document
   */
  async getDocumentPermissions(
    documentId: string,
  ): Promise<DocumentPermissionEntry[]> {
    const results = await this.db
      .selectFrom("DocumentPermission")
      .select([
        "documentId",
        "userAddress",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where("documentId", "=", documentId)
      .execute();

    return results;
  }

  /**
   * Get all documents a user has explicit access to
   */
  async getUserDocuments(
    userAddress: string,
  ): Promise<DocumentPermissionEntry[]> {
    const results = await this.db
      .selectFrom("DocumentPermission")
      .select([
        "documentId",
        "userAddress",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where("userAddress", "=", userAddress.toLowerCase())
      .execute();

    return results;
  }

  /**
   * Grant or update a user's permission on a document.
   */
  async grantPermission(
    documentId: string,
    userAddress: string,
    permission: DocumentPermissionLevel,
    grantedBy: string,
  ): Promise<DocumentPermissionEntry> {
    const now = new Date();
    const normalizedAddress = userAddress.toLowerCase();

    await this.db
      .insertInto("DocumentPermission")
      .values({
        documentId,
        userAddress: normalizedAddress,
        permission,
        grantedBy: grantedBy.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.columns(["documentId", "userAddress"]).doUpdateSet({
          permission,
          grantedBy: grantedBy.toLowerCase(),
          updatedAt: now,
        }),
      )
      .execute();

    const result = await this.db
      .selectFrom("DocumentPermission")
      .select([
        "documentId",
        "userAddress",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where("documentId", "=", documentId)
      .where("userAddress", "=", normalizedAddress)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Revoke a user's permission on a document
   */
  async revokePermission(
    documentId: string,
    userAddress: string,
  ): Promise<void> {
    await this.db
      .deleteFrom("DocumentPermission")
      .where("documentId", "=", documentId)
      .where("userAddress", "=", userAddress.toLowerCase())
      .execute();
  }

  /**
   * Delete all permissions for a document (used when deleting a document)
   */
  async deleteAllDocumentPermissions(documentId: string): Promise<void> {
    await this.db
      .deleteFrom("DocumentPermission")
      .where("documentId", "=", documentId)
      .execute();

    await this.db
      .deleteFrom("DocumentGroupPermission")
      .where("documentId", "=", documentId)
      .execute();

    await this.db
      .deleteFrom("OperationUserPermission")
      .where("documentId", "=", documentId)
      .execute();

    await this.db
      .deleteFrom("OperationGroupPermission")
      .where("documentId", "=", documentId)
      .execute();
  }

  // ============================================
  // Access Control Checks
  // ============================================

  /**
   * Check if a user can read a document.
   * Returns true if user has READ, WRITE, or ADMIN permission (direct or via group)
   */
  async canReadDocument(
    documentId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    if (!userAddress) {
      return false;
    }

    // Check direct user permission
    const directPermission = await this.getUserPermission(
      documentId,
      userAddress,
    );
    if (directPermission !== null) {
      return true;
    }

    // Check group permission
    const groupPermission = await this.getUserGroupPermission(
      documentId,
      userAddress,
    );
    return groupPermission !== null;
  }

  /**
   * Check if a user can write to a document.
   * Returns true if user has WRITE or ADMIN permission (direct or via group)
   */
  async canWriteDocument(
    documentId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    if (!userAddress) {
      return false;
    }

    // Check direct user permission
    const directPermission = await this.getUserPermission(
      documentId,
      userAddress,
    );
    if (directPermission === "WRITE" || directPermission === "ADMIN") {
      return true;
    }

    // Check group permission
    const groupPermission = await this.getUserGroupPermission(
      documentId,
      userAddress,
    );
    return groupPermission === "WRITE" || groupPermission === "ADMIN";
  }

  /**
   * Check if a user can manage a document (change permissions, settings).
   * Returns true if user has ADMIN permission (direct or via group)
   */
  async canManageDocument(
    documentId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    if (!userAddress) {
      return false;
    }

    // Check direct user permission
    const directPermission = await this.getUserPermission(
      documentId,
      userAddress,
    );
    if (directPermission === "ADMIN") {
      return true;
    }

    // Check group permission
    const groupPermission = await this.getUserGroupPermission(
      documentId,
      userAddress,
    );
    return groupPermission === "ADMIN";
  }

  // ============================================
  // Access Control Checks (With Parent Hierarchy)
  // ============================================

  /**
   * Check if a user can read a document, including parent permission inheritance.
   * Returns true if user has permission on the document OR any parent in the hierarchy.
   */
  async canRead(
    documentId: string,
    userAddress: string | undefined,
    getParentIds: GetParentIdsFn,
  ): Promise<boolean> {
    // Check if user has direct permission on this document
    const canReadThis = await this.canReadDocument(documentId, userAddress);
    if (canReadThis) {
      return true;
    }

    // Check if user has permission on any parent (inheritance)
    const parentIds = await getParentIds(documentId);
    for (const parentId of parentIds) {
      const canReadParent = await this.canRead(
        parentId,
        userAddress,
        getParentIds,
      );
      if (canReadParent) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a user can write to a document, including parent permission inheritance.
   * Returns true if user has write permission on the document OR any parent in the hierarchy.
   */
  async canWrite(
    documentId: string,
    userAddress: string | undefined,
    getParentIds: GetParentIdsFn,
  ): Promise<boolean> {
    // Check if user has direct write permission on this document
    const canWriteThis = await this.canWriteDocument(documentId, userAddress);
    if (canWriteThis) {
      return true;
    }

    // Check if user has write permission on any parent (inheritance)
    const parentIds = await getParentIds(documentId);
    for (const parentId of parentIds) {
      const canWriteParent = await this.canWrite(
        parentId,
        userAddress,
        getParentIds,
      );
      if (canWriteParent) {
        return true;
      }
    }

    return false;
  }

  /**
   * Filter a list of document IDs to only include those the user can read.
   */
  async filterReadableDocuments(
    documentIds: string[],
    userAddress: string | undefined,
    getParentIds: GetParentIdsFn,
  ): Promise<string[]> {
    const results: string[] = [];

    for (const docId of documentIds) {
      const canReadDoc = await this.canRead(docId, userAddress, getParentIds);
      if (canReadDoc) {
        results.push(docId);
      }
    }

    return results;
  }

  // ============================================
  // Group Management
  // ============================================

  /**
   * Create a new group
   */
  async createGroup(name: string, description?: string): Promise<Group> {
    const now = new Date();

    await this.db
      .insertInto("Group")
      .values({
        name,
        description: description ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const result = await this.db
      .selectFrom("Group")
      .select(["id", "name", "description", "createdAt", "updatedAt"])
      .where("name", "=", name)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Delete a group and all its associations
   */
  async deleteGroup(groupId: number): Promise<void> {
    // Delete group permissions on operations
    await this.db
      .deleteFrom("OperationGroupPermission")
      .where("groupId", "=", groupId)
      .execute();

    // Delete group document permissions
    await this.db
      .deleteFrom("DocumentGroupPermission")
      .where("groupId", "=", groupId)
      .execute();

    // Delete user-group memberships
    await this.db
      .deleteFrom("UserGroup")
      .where("groupId", "=", groupId)
      .execute();

    // Delete the group
    await this.db.deleteFrom("Group").where("id", "=", groupId).execute();
  }

  /**
   * Get a group by ID
   */
  async getGroup(groupId: number): Promise<Group | null> {
    const result = await this.db
      .selectFrom("Group")
      .select(["id", "name", "description", "createdAt", "updatedAt"])
      .where("id", "=", groupId)
      .executeTakeFirst();

    return result ?? null;
  }

  /**
   * List all groups
   */
  async listGroups(): Promise<Group[]> {
    return this.db
      .selectFrom("Group")
      .select(["id", "name", "description", "createdAt", "updatedAt"])
      .execute();
  }

  /**
   * Add a user to a group
   */
  async addUserToGroup(userAddress: string, groupId: number): Promise<void> {
    const now = new Date();
    const normalizedAddress = userAddress.toLowerCase();

    await this.db
      .insertInto("UserGroup")
      .values({
        userAddress: normalizedAddress,
        groupId,
        createdAt: now,
      })
      .onConflict((oc) => oc.columns(["userAddress", "groupId"]).doNothing())
      .execute();
  }

  /**
   * Remove a user from a group
   */
  async removeUserFromGroup(
    userAddress: string,
    groupId: number,
  ): Promise<void> {
    await this.db
      .deleteFrom("UserGroup")
      .where("userAddress", "=", userAddress.toLowerCase())
      .where("groupId", "=", groupId)
      .execute();
  }

  /**
   * Get all groups a user belongs to
   */
  async getUserGroups(userAddress: string): Promise<Group[]> {
    return this.db
      .selectFrom("UserGroup")
      .innerJoin("Group", "Group.id", "UserGroup.groupId")
      .select([
        "Group.id",
        "Group.name",
        "Group.description",
        "Group.createdAt",
        "Group.updatedAt",
      ])
      .where("UserGroup.userAddress", "=", userAddress.toLowerCase())
      .execute();
  }

  /**
   * Get all members of a group
   */
  async getGroupMembers(groupId: number): Promise<string[]> {
    const results = await this.db
      .selectFrom("UserGroup")
      .select("userAddress")
      .where("groupId", "=", groupId)
      .execute();

    return results.map((r) => r.userAddress);
  }

  // ============================================
  // Group Document Permissions
  // ============================================

  /**
   * Grant a group permission on a document
   */
  async grantGroupPermission(
    documentId: string,
    groupId: number,
    permission: DocumentPermissionLevel,
    grantedBy: string,
  ): Promise<DocumentGroupPermissionEntry> {
    const now = new Date();

    await this.db
      .insertInto("DocumentGroupPermission")
      .values({
        documentId,
        groupId,
        permission,
        grantedBy: grantedBy.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.columns(["documentId", "groupId"]).doUpdateSet({
          permission,
          grantedBy: grantedBy.toLowerCase(),
          updatedAt: now,
        }),
      )
      .execute();

    const result = await this.db
      .selectFrom("DocumentGroupPermission")
      .select([
        "documentId",
        "groupId",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where("documentId", "=", documentId)
      .where("groupId", "=", groupId)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Revoke a group's permission on a document
   */
  async revokeGroupPermission(
    documentId: string,
    groupId: number,
  ): Promise<void> {
    await this.db
      .deleteFrom("DocumentGroupPermission")
      .where("documentId", "=", documentId)
      .where("groupId", "=", groupId)
      .execute();
  }

  /**
   * Get all group permissions for a document
   */
  async getDocumentGroupPermissions(
    documentId: string,
  ): Promise<DocumentGroupPermissionEntry[]> {
    return this.db
      .selectFrom("DocumentGroupPermission")
      .select([
        "documentId",
        "groupId",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where("documentId", "=", documentId)
      .execute();
  }

  /**
   * Get best permission level a user has on a document via groups
   */
  async getUserGroupPermission(
    documentId: string,
    userAddress: string,
  ): Promise<DocumentPermissionLevel | null> {
    const result = await this.db
      .selectFrom("DocumentGroupPermission")
      .innerJoin(
        "UserGroup",
        "UserGroup.groupId",
        "DocumentGroupPermission.groupId",
      )
      .select("DocumentGroupPermission.permission")
      .where("DocumentGroupPermission.documentId", "=", documentId)
      .where("UserGroup.userAddress", "=", userAddress.toLowerCase())
      .execute();

    if (result.length === 0) {
      return null;
    }

    // Return highest permission level
    if (result.some((r) => r.permission === "ADMIN")) return "ADMIN";
    if (result.some((r) => r.permission === "WRITE")) return "WRITE";
    return "READ";
  }

  // ============================================
  // Operation Permissions
  // ============================================

  /**
   * Grant a user permission to execute an operation on a document
   */
  async grantOperationPermission(
    documentId: string,
    operationType: string,
    userAddress: string,
    grantedBy: string,
  ): Promise<OperationUserPermissionEntry> {
    const now = new Date();
    const normalizedAddress = userAddress.toLowerCase();

    await this.db
      .insertInto("OperationUserPermission")
      .values({
        documentId,
        operationType,
        userAddress: normalizedAddress,
        grantedBy: grantedBy.toLowerCase(),
        createdAt: now,
      })
      .onConflict((oc) =>
        oc.columns(["documentId", "operationType", "userAddress"]).doNothing(),
      )
      .execute();

    const result = await this.db
      .selectFrom("OperationUserPermission")
      .select([
        "documentId",
        "operationType",
        "userAddress",
        "grantedBy",
        "createdAt",
      ])
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .where("userAddress", "=", normalizedAddress)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Revoke a user's permission to execute an operation
   */
  async revokeOperationPermission(
    documentId: string,
    operationType: string,
    userAddress: string,
  ): Promise<void> {
    await this.db
      .deleteFrom("OperationUserPermission")
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .where("userAddress", "=", userAddress.toLowerCase())
      .execute();
  }

  /**
   * Grant a group permission to execute an operation on a document
   */
  async grantGroupOperationPermission(
    documentId: string,
    operationType: string,
    groupId: number,
    grantedBy: string,
  ): Promise<OperationGroupPermissionEntry> {
    const now = new Date();

    await this.db
      .insertInto("OperationGroupPermission")
      .values({
        documentId,
        operationType,
        groupId,
        grantedBy: grantedBy.toLowerCase(),
        createdAt: now,
      })
      .onConflict((oc) =>
        oc.columns(["documentId", "operationType", "groupId"]).doNothing(),
      )
      .execute();

    const result = await this.db
      .selectFrom("OperationGroupPermission")
      .select([
        "documentId",
        "operationType",
        "groupId",
        "grantedBy",
        "createdAt",
      ])
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .where("groupId", "=", groupId)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Revoke a group's permission to execute an operation
   */
  async revokeGroupOperationPermission(
    documentId: string,
    operationType: string,
    groupId: number,
  ): Promise<void> {
    await this.db
      .deleteFrom("OperationGroupPermission")
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .where("groupId", "=", groupId)
      .execute();
  }

  /**
   * Get all users with permission to execute an operation
   */
  async getOperationUserPermissions(
    documentId: string,
    operationType: string,
  ): Promise<OperationUserPermissionEntry[]> {
    return this.db
      .selectFrom("OperationUserPermission")
      .select([
        "documentId",
        "operationType",
        "userAddress",
        "grantedBy",
        "createdAt",
      ])
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .execute();
  }

  /**
   * Get all groups with permission to execute an operation
   */
  async getOperationGroupPermissions(
    documentId: string,
    operationType: string,
  ): Promise<OperationGroupPermissionEntry[]> {
    return this.db
      .selectFrom("OperationGroupPermission")
      .select([
        "documentId",
        "operationType",
        "groupId",
        "grantedBy",
        "createdAt",
      ])
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .execute();
  }

  /**
   * Check if a user can execute a specific operation on a document.
   * Returns true if user has direct permission or is in a group with permission.
   */
  async canExecuteOperation(
    documentId: string,
    operationType: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    if (!userAddress) {
      return false;
    }

    const normalizedAddress = userAddress.toLowerCase();

    // Check direct user permission
    const userPermission = await this.db
      .selectFrom("OperationUserPermission")
      .select("userAddress")
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .where("userAddress", "=", normalizedAddress)
      .executeTakeFirst();

    if (userPermission) {
      return true;
    }

    // Check group permission
    const groupPermission = await this.db
      .selectFrom("OperationGroupPermission")
      .innerJoin(
        "UserGroup",
        "UserGroup.groupId",
        "OperationGroupPermission.groupId",
      )
      .select("OperationGroupPermission.groupId")
      .where("OperationGroupPermission.documentId", "=", documentId)
      .where("OperationGroupPermission.operationType", "=", operationType)
      .where("UserGroup.userAddress", "=", normalizedAddress)
      .executeTakeFirst();

    return !!groupPermission;
  }

  /**
   * Check if an operation has any permissions set (is restricted)
   */
  async isOperationRestricted(
    documentId: string,
    operationType: string,
  ): Promise<boolean> {
    const userPermCount = await this.db
      .selectFrom("OperationUserPermission")
      .select(sql<number>`count(*)`.as("count"))
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .executeTakeFirst();

    if (userPermCount && Number(userPermCount.count) > 0) {
      return true;
    }

    const groupPermCount = await this.db
      .selectFrom("OperationGroupPermission")
      .select(sql<number>`count(*)`.as("count"))
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .executeTakeFirst();

    return groupPermCount !== undefined && Number(groupPermCount.count) > 0;
  }
}
