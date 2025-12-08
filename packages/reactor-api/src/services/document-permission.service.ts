import type { Kysely } from "kysely";
import { sql } from "kysely";
import type {
  DocumentPermissionDatabase,
  DocumentPermissionLevel,
  DocumentVisibility,
} from "../utils/db.js";

export interface DocumentPermissionEntry {
  documentId: string;
  userAddress: string;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentVisibilityEntry {
  documentId: string;
  visibility: DocumentVisibility;
  createdAt: Date;
  updatedAt: Date;
}

// Group types
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

// Role types
export interface Role {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Operation restriction types
export interface OperationRestriction {
  id: number;
  documentId: string;
  operationType: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Function type for getting parent document IDs
 * This is injected to avoid circular dependencies with the reactor client
 */
export type GetParentIdsFn = (documentId: string) => Promise<string[]>;

/**
 * Service for managing document-level permissions.
 *
 * Document visibility levels:
 * - PUBLIC: Anyone can read/sync the document (default)
 * - PROTECTED: Only users with explicit permissions can access
 * - PRIVATE: Document is not synced at all (local only)
 *
 * Permission levels for protected documents:
 * - READ: Can fetch and read the document
 * - WRITE: Can push updates and modify the document
 * - ADMIN: Can manage document permissions and settings
 *
 * Parent permission inheritance:
 * - If a parent document denies access, children are also inaccessible
 * - Permission checks walk up the document tree
 */
export class DocumentPermissionService {
  private initialized = false;

  constructor(private readonly db: Kysely<DocumentPermissionDatabase>) {}

  /**
   * Initialize the database tables for document permissions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create DocumentVisibility table
    await sql`
      CREATE TABLE IF NOT EXISTS "DocumentVisibility" (
        "documentId" VARCHAR(255) PRIMARY KEY,
        "visibility" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' CHECK ("visibility" IN ('PUBLIC', 'PROTECTED', 'PRIVATE')),
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(this.db);

    // Create DocumentPermission table
    await sql`
      CREATE TABLE IF NOT EXISTS "DocumentPermission" (
        "id" SERIAL PRIMARY KEY,
        "documentId" VARCHAR(255) NOT NULL,
        "userAddress" VARCHAR(255) NOT NULL,
        "permission" VARCHAR(20) NOT NULL CHECK ("permission" IN ('READ', 'WRITE', 'ADMIN')),
        "grantedBy" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("documentId", "userAddress")
      )
    `.execute(this.db);

    // Create indexes for DocumentPermission
    await sql`CREATE INDEX IF NOT EXISTS "documentpermission_documentid_index" ON "DocumentPermission" ("documentId")`.execute(
      this.db,
    );
    await sql`CREATE INDEX IF NOT EXISTS "documentpermission_useraddress_index" ON "DocumentPermission" ("userAddress")`.execute(
      this.db,
    );

    // Create Group table
    await sql`
      CREATE TABLE IF NOT EXISTS "Group" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL UNIQUE,
        "description" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(this.db);

    // Create UserGroup table (user-group membership)
    await sql`
      CREATE TABLE IF NOT EXISTS "UserGroup" (
        "userAddress" VARCHAR(255) NOT NULL,
        "groupId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("userAddress", "groupId")
      )
    `.execute(this.db);

    await sql`CREATE INDEX IF NOT EXISTS "usergroup_groupid_index" ON "UserGroup" ("groupId")`.execute(
      this.db,
    );

    // Create DocumentGroupPermission table
    await sql`
      CREATE TABLE IF NOT EXISTS "DocumentGroupPermission" (
        "id" SERIAL PRIMARY KEY,
        "documentId" VARCHAR(255) NOT NULL,
        "groupId" INTEGER NOT NULL,
        "permission" VARCHAR(20) NOT NULL CHECK ("permission" IN ('READ', 'WRITE', 'ADMIN')),
        "grantedBy" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("documentId", "groupId")
      )
    `.execute(this.db);

    await sql`CREATE INDEX IF NOT EXISTS "documentgrouppermission_documentid_index" ON "DocumentGroupPermission" ("documentId")`.execute(
      this.db,
    );
    await sql`CREATE INDEX IF NOT EXISTS "documentgrouppermission_groupid_index" ON "DocumentGroupPermission" ("groupId")`.execute(
      this.db,
    );

    // Create Role table
    await sql`
      CREATE TABLE IF NOT EXISTS "Role" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL UNIQUE,
        "description" TEXT,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(this.db);

    // Create UserRole table (user-role assignment)
    await sql`
      CREATE TABLE IF NOT EXISTS "UserRole" (
        "userAddress" VARCHAR(255) NOT NULL,
        "roleId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY ("userAddress", "roleId")
      )
    `.execute(this.db);

    await sql`CREATE INDEX IF NOT EXISTS "userrole_roleid_index" ON "UserRole" ("roleId")`.execute(
      this.db,
    );

    // Create DocumentOperationRestriction table
    await sql`
      CREATE TABLE IF NOT EXISTS "DocumentOperationRestriction" (
        "id" SERIAL PRIMARY KEY,
        "documentId" VARCHAR(255) NOT NULL,
        "operationType" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("documentId", "operationType")
      )
    `.execute(this.db);

    await sql`CREATE INDEX IF NOT EXISTS "documentoperationrestriction_documentid_index" ON "DocumentOperationRestriction" ("documentId")`.execute(
      this.db,
    );

    // Create OperationRolePermission table
    await sql`
      CREATE TABLE IF NOT EXISTS "OperationRolePermission" (
        "id" SERIAL PRIMARY KEY,
        "restrictionId" INTEGER NOT NULL,
        "roleId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("restrictionId", "roleId")
      )
    `.execute(this.db);

    await sql`CREATE INDEX IF NOT EXISTS "operationrolepermission_restrictionid_index" ON "OperationRolePermission" ("restrictionId")`.execute(
      this.db,
    );

    // Create OperationGroupPermission table
    await sql`
      CREATE TABLE IF NOT EXISTS "OperationGroupPermission" (
        "id" SERIAL PRIMARY KEY,
        "restrictionId" INTEGER NOT NULL,
        "groupId" INTEGER NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("restrictionId", "groupId")
      )
    `.execute(this.db);

    await sql`CREATE INDEX IF NOT EXISTS "operationgrouppermission_restrictionid_index" ON "OperationGroupPermission" ("restrictionId")`.execute(
      this.db,
    );

    this.initialized = true;
  }

  // ============================================
  // Document Visibility Operations
  // ============================================

  /**
   * Get the visibility level for a document.
   * Returns 'PUBLIC' if no explicit visibility is set.
   */
  async getDocumentVisibility(documentId: string): Promise<DocumentVisibility> {
    const result = await this.db
      .selectFrom("DocumentVisibility")
      .select("visibility")
      .where("documentId", "=", documentId)
      .executeTakeFirst();

    return result?.visibility ?? "PUBLIC";
  }

  /**
   * Set the visibility level for a document.
   * Creates a new entry or updates existing one.
   */
  async setDocumentVisibility(
    documentId: string,
    visibility: DocumentVisibility,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("DocumentVisibility")
      .values({
        documentId,
        visibility,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.column("documentId").doUpdateSet({
          visibility,
          updatedAt: now,
        }),
      )
      .execute();
  }

  /**
   * Delete visibility entry for a document (resets to default PUBLIC)
   */
  async deleteDocumentVisibility(documentId: string): Promise<void> {
    await this.db
      .deleteFrom("DocumentVisibility")
      .where("documentId", "=", documentId)
      .execute();
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
   * Only users with ADMIN permission (or global admins) can grant permissions.
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
  }

  // ============================================
  // Access Control Checks (Single Document)
  // ============================================

  /**
   * Check if a user can read a single document (without parent checks).
   * Returns true if:
   * - Document is PUBLIC
   * - Document is PROTECTED and user has READ, WRITE, or ADMIN permission (direct or via group)
   */
  async canReadDocument(
    documentId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    const visibility = await this.getDocumentVisibility(documentId);

    if (visibility === "PUBLIC") {
      return true;
    }

    if (visibility === "PRIVATE") {
      return false;
    }

    // PROTECTED: check user permission (direct or via group)
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
   * Check if a user can write to a single document (without parent checks).
   * Returns true if:
   * - Document is PUBLIC (global permissions should gate this)
   * - Document is PROTECTED and user has WRITE or ADMIN permission (direct or via group)
   */
  async canWriteDocument(
    documentId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    const visibility = await this.getDocumentVisibility(documentId);

    if (visibility === "PUBLIC") {
      return true; // Global permissions will gate this
    }

    if (visibility === "PRIVATE") {
      return false;
    }

    // PROTECTED: check user permission (direct or via group)
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
   * Returns true if:
   * - Document is PROTECTED and user has ADMIN permission (direct or via group)
   */
  async canManageDocument(
    documentId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    if (!userAddress) {
      return false;
    }

    const visibility = await this.getDocumentVisibility(documentId);

    if (visibility === "PRIVATE") {
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

  /**
   * Check if a document is syncable (not PRIVATE)
   */
  async isSyncable(documentId: string): Promise<boolean> {
    const visibility = await this.getDocumentVisibility(documentId);
    return visibility !== "PRIVATE";
  }

  // ============================================
  // Access Control Checks (With Parent Hierarchy)
  // ============================================

  /**
   * Check if a user can read a document, including parent permission checks.
   * If any parent denies access, the document is inaccessible.
   *
   * @param documentId - The document to check
   * @param userAddress - The user's address (undefined for anonymous)
   * @param getParentIds - Function to get parent IDs for a document
   * @returns true if user can read the document and all its parents
   */
  async canRead(
    documentId: string,
    userAddress: string | undefined,
    getParentIds: GetParentIdsFn,
  ): Promise<boolean> {
    // Check the document itself
    const canReadThis = await this.canReadDocument(documentId, userAddress);
    if (!canReadThis) {
      return false;
    }

    // Check all parents recursively
    const parentIds = await getParentIds(documentId);
    for (const parentId of parentIds) {
      const canReadParent = await this.canRead(
        parentId,
        userAddress,
        getParentIds,
      );
      if (!canReadParent) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if a user can write to a document, including parent permission checks.
   * If any parent denies write access, the document is not writable.
   *
   * @param documentId - The document to check
   * @param userAddress - The user's address (undefined for anonymous)
   * @param getParentIds - Function to get parent IDs for a document
   * @returns true if user can write to the document and all its parents allow it
   */
  async canWrite(
    documentId: string,
    userAddress: string | undefined,
    getParentIds: GetParentIdsFn,
  ): Promise<boolean> {
    // Check the document itself
    const canWriteThis = await this.canWriteDocument(documentId, userAddress);
    if (!canWriteThis) {
      return false;
    }

    // Check all parents recursively (need at least read access to parents)
    const parentIds = await getParentIds(documentId);
    for (const parentId of parentIds) {
      const canReadParent = await this.canRead(
        parentId,
        userAddress,
        getParentIds,
      );
      if (!canReadParent) {
        return false;
      }
    }

    return true;
  }

  /**
   * Filter a list of document IDs to only include those the user can read.
   *
   * @param documentIds - List of document IDs to filter
   * @param userAddress - The user's address (undefined for anonymous)
   * @param getParentIds - Function to get parent IDs for a document
   * @returns Filtered list of document IDs the user can access
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
  // Role Management
  // ============================================

  /**
   * Create a new role
   */
  async createRole(name: string, description?: string): Promise<Role> {
    const now = new Date();

    await this.db
      .insertInto("Role")
      .values({
        name,
        description: description ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .execute();

    const result = await this.db
      .selectFrom("Role")
      .select(["id", "name", "description", "createdAt", "updatedAt"])
      .where("name", "=", name)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Delete a role and all its associations
   */
  async deleteRole(roleId: number): Promise<void> {
    // Delete role permissions on operations
    await this.db
      .deleteFrom("OperationRolePermission")
      .where("roleId", "=", roleId)
      .execute();

    // Delete user-role assignments
    await this.db.deleteFrom("UserRole").where("roleId", "=", roleId).execute();

    // Delete the role
    await this.db.deleteFrom("Role").where("id", "=", roleId).execute();
  }

  /**
   * Get a role by ID
   */
  async getRole(roleId: number): Promise<Role | null> {
    const result = await this.db
      .selectFrom("Role")
      .select(["id", "name", "description", "createdAt", "updatedAt"])
      .where("id", "=", roleId)
      .executeTakeFirst();

    return result ?? null;
  }

  /**
   * List all roles
   */
  async listRoles(): Promise<Role[]> {
    return this.db
      .selectFrom("Role")
      .select(["id", "name", "description", "createdAt", "updatedAt"])
      .execute();
  }

  /**
   * Assign a role to a user
   */
  async assignRoleToUser(userAddress: string, roleId: number): Promise<void> {
    const now = new Date();
    const normalizedAddress = userAddress.toLowerCase();

    await this.db
      .insertInto("UserRole")
      .values({
        userAddress: normalizedAddress,
        roleId,
        createdAt: now,
      })
      .onConflict((oc) => oc.columns(["userAddress", "roleId"]).doNothing())
      .execute();
  }

  /**
   * Remove a role from a user
   */
  async removeRoleFromUser(userAddress: string, roleId: number): Promise<void> {
    await this.db
      .deleteFrom("UserRole")
      .where("userAddress", "=", userAddress.toLowerCase())
      .where("roleId", "=", roleId)
      .execute();
  }

  /**
   * Get all roles assigned to a user
   */
  async getUserRoles(userAddress: string): Promise<Role[]> {
    return this.db
      .selectFrom("UserRole")
      .innerJoin("Role", "Role.id", "UserRole.roleId")
      .select([
        "Role.id",
        "Role.name",
        "Role.description",
        "Role.createdAt",
        "Role.updatedAt",
      ])
      .where("UserRole.userAddress", "=", userAddress.toLowerCase())
      .execute();
  }

  // ============================================
  // Operation Restrictions
  // ============================================

  /**
   * Restrict an operation on a document (only allowed roles/groups can execute)
   */
  async restrictOperation(
    documentId: string,
    operationType: string,
  ): Promise<OperationRestriction> {
    const now = new Date();

    await this.db
      .insertInto("DocumentOperationRestriction")
      .values({
        documentId,
        operationType,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.columns(["documentId", "operationType"]).doUpdateSet({
          updatedAt: now,
        }),
      )
      .execute();

    const result = await this.db
      .selectFrom("DocumentOperationRestriction")
      .select(["id", "documentId", "operationType", "createdAt", "updatedAt"])
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Remove operation restriction (allows anyone with write access)
   */
  async unrestrictOperation(
    documentId: string,
    operationType: string,
  ): Promise<void> {
    // First get the restriction ID
    const restriction = await this.db
      .selectFrom("DocumentOperationRestriction")
      .select("id")
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .executeTakeFirst();

    if (restriction) {
      // Delete associated role and group permissions
      await this.db
        .deleteFrom("OperationRolePermission")
        .where("restrictionId", "=", restriction.id)
        .execute();

      await this.db
        .deleteFrom("OperationGroupPermission")
        .where("restrictionId", "=", restriction.id)
        .execute();

      // Delete the restriction
      await this.db
        .deleteFrom("DocumentOperationRestriction")
        .where("id", "=", restriction.id)
        .execute();
    }
  }

  /**
   * Get all operation restrictions for a document
   */
  async getDocumentRestrictions(
    documentId: string,
  ): Promise<OperationRestriction[]> {
    return this.db
      .selectFrom("DocumentOperationRestriction")
      .select(["id", "documentId", "operationType", "createdAt", "updatedAt"])
      .where("documentId", "=", documentId)
      .execute();
  }

  /**
   * Get a specific operation restriction
   */
  async getOperationRestriction(
    documentId: string,
    operationType: string,
  ): Promise<OperationRestriction | null> {
    const result = await this.db
      .selectFrom("DocumentOperationRestriction")
      .select(["id", "documentId", "operationType", "createdAt", "updatedAt"])
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .executeTakeFirst();

    return result ?? null;
  }

  /**
   * Allow a role to execute a restricted operation
   */
  async allowRoleForOperation(
    restrictionId: number,
    roleId: number,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("OperationRolePermission")
      .values({
        restrictionId,
        roleId,
        createdAt: now,
      })
      .onConflict((oc) => oc.columns(["restrictionId", "roleId"]).doNothing())
      .execute();
  }

  /**
   * Disallow a role from executing a restricted operation
   */
  async disallowRoleForOperation(
    restrictionId: number,
    roleId: number,
  ): Promise<void> {
    await this.db
      .deleteFrom("OperationRolePermission")
      .where("restrictionId", "=", restrictionId)
      .where("roleId", "=", roleId)
      .execute();
  }

  /**
   * Allow a group to execute a restricted operation
   */
  async allowGroupForOperation(
    restrictionId: number,
    groupId: number,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("OperationGroupPermission")
      .values({
        restrictionId,
        groupId,
        createdAt: now,
      })
      .onConflict((oc) => oc.columns(["restrictionId", "groupId"]).doNothing())
      .execute();
  }

  /**
   * Disallow a group from executing a restricted operation
   */
  async disallowGroupForOperation(
    restrictionId: number,
    groupId: number,
  ): Promise<void> {
    await this.db
      .deleteFrom("OperationGroupPermission")
      .where("restrictionId", "=", restrictionId)
      .where("groupId", "=", groupId)
      .execute();
  }

  /**
   * Get roles allowed for an operation restriction
   */
  async getAllowedRolesForOperation(restrictionId: number): Promise<Role[]> {
    return this.db
      .selectFrom("OperationRolePermission")
      .innerJoin("Role", "Role.id", "OperationRolePermission.roleId")
      .select([
        "Role.id",
        "Role.name",
        "Role.description",
        "Role.createdAt",
        "Role.updatedAt",
      ])
      .where("OperationRolePermission.restrictionId", "=", restrictionId)
      .execute();
  }

  /**
   * Get groups allowed for an operation restriction
   */
  async getAllowedGroupsForOperation(restrictionId: number): Promise<Group[]> {
    return this.db
      .selectFrom("OperationGroupPermission")
      .innerJoin("Group", "Group.id", "OperationGroupPermission.groupId")
      .select([
        "Group.id",
        "Group.name",
        "Group.description",
        "Group.createdAt",
        "Group.updatedAt",
      ])
      .where("OperationGroupPermission.restrictionId", "=", restrictionId)
      .execute();
  }

  // ============================================
  // Operation Access Control
  // ============================================

  /**
   * Check if a user can execute a specific operation on a document.
   *
   * Restrictive model:
   * - If the operation is NOT restricted → return true (allowed by default)
   * - If the operation IS restricted → check if user has an allowed role or is in an allowed group
   *
   * @param documentId - The document ID
   * @param operationType - The operation type (e.g., "CONFIRM_TRANSACTION")
   * @param userAddress - The user's address
   * @returns true if user can execute the operation
   */
  async canExecuteOperation(
    documentId: string,
    operationType: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    // Get the restriction for this operation
    const restriction = await this.getOperationRestriction(
      documentId,
      operationType,
    );

    // If operation is not restricted, it's allowed by default
    if (!restriction) {
      return true;
    }

    // If user is not authenticated, they can't execute restricted operations
    if (!userAddress) {
      return false;
    }

    const normalizedAddress = userAddress.toLowerCase();

    // Check if user has any of the allowed roles
    const userRoleMatch = await this.db
      .selectFrom("UserRole")
      .innerJoin(
        "OperationRolePermission",
        "OperationRolePermission.roleId",
        "UserRole.roleId",
      )
      .select("UserRole.roleId")
      .where("UserRole.userAddress", "=", normalizedAddress)
      .where("OperationRolePermission.restrictionId", "=", restriction.id)
      .executeTakeFirst();

    if (userRoleMatch) {
      return true;
    }

    // Check if user is in any of the allowed groups
    const userGroupMatch = await this.db
      .selectFrom("UserGroup")
      .innerJoin(
        "OperationGroupPermission",
        "OperationGroupPermission.groupId",
        "UserGroup.groupId",
      )
      .select("UserGroup.groupId")
      .where("UserGroup.userAddress", "=", normalizedAddress)
      .where("OperationGroupPermission.restrictionId", "=", restriction.id)
      .executeTakeFirst();

    return !!userGroupMatch;
  }
}
