import type { Kysely } from "kysely";
import { sql } from "kysely";
import type {
  DocumentPermissionDatabase,
  DocumentPermissionLevel,
} from "../utils/db.js";

export interface DocumentPermissionEntry {
  documentId: string;
  userAddress: string;
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

/**
 * Function type for getting parent document IDs
 * This is injected to avoid circular dependencies with the reactor client
 */
export type GetParentIdsFn = (documentId: string) => Promise<string[]>;

/**
 * Configuration for the DocumentPermissionService
 */
export interface DocumentPermissionConfig {
  defaultProtection: boolean;
}

/**
 * Service for managing document-level permissions.
 *
 * Permission levels for documents:
 * - READ: Can fetch and read the document
 * - WRITE: Can push updates and modify the document
 * - ADMIN: Can manage document permissions and settings
 *
 * Operation permissions:
 * - Users can be granted permission to execute specific operations
 */
export class DocumentPermissionService {
  readonly config: DocumentPermissionConfig;

  constructor(
    private readonly db: Kysely<DocumentPermissionDatabase>,
    config: DocumentPermissionConfig = { defaultProtection: false },
  ) {
    this.config = config;
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
      .deleteFrom("OperationUserPermission")
      .where("documentId", "=", documentId)
      .execute();
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
   * Whether an operation-permission row exists for the user on this operation.
   */
  async hasOperationGrant(
    documentId: string,
    operationType: string,
    userAddress: string,
  ): Promise<boolean> {
    const normalizedAddress = userAddress.toLowerCase();

    const userPermission = await this.db
      .selectFrom("OperationUserPermission")
      .select("userAddress")
      .where("documentId", "=", documentId)
      .where("operationType", "=", operationType)
      .where("userAddress", "=", normalizedAddress)
      .executeTakeFirst();

    return !!userPermission;
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

    return userPermCount !== undefined && Number(userPermCount.count) > 0;
  }

  // ============================================
  // Document Protection
  // ============================================

  /**
   * Check if a specific document has a protection row set to true.
   * Falls back to `config.defaultProtection` if no row exists.
   */
  async isDocumentProtected(documentId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("DocumentProtection")
      .select("protected")
      .where("documentId", "=", documentId)
      .executeTakeFirst();

    if (row === undefined) {
      return this.config.defaultProtection;
    }

    return row.protected;
  }

  /**
   * Walk the parent chain: if the document itself or any ancestor is protected, return true.
   * Collects all ancestor IDs first (with cycle detection), then batch-checks protection.
   */
  async isProtectedWithAncestors(
    documentId: string,
    getParentIds: GetParentIdsFn,
  ): Promise<boolean> {
    // Collect all IDs in the hierarchy (document + all ancestors)
    const allIds = await this.collectAncestorIds(documentId, getParentIds);

    // Batch-check protection for all IDs at once
    if (allIds.length === 0) {
      return this.config.defaultProtection;
    }

    const rows = await this.db
      .selectFrom("DocumentProtection")
      .select(["documentId", "protected"])
      .where("documentId", "in", allIds)
      .execute();

    const protectionMap = new Map(rows.map((r) => [r.documentId, r.protected]));

    for (const id of allIds) {
      const isProtected = protectionMap.get(id);
      // If no row exists, fall back to defaultProtection
      if (isProtected ?? this.config.defaultProtection) {
        return true;
      }
    }

    return false;
  }

  /**
   * Collect all ancestor IDs (including the document itself) with cycle detection.
   */
  private async collectAncestorIds(
    documentId: string,
    getParentIds: GetParentIdsFn,
  ): Promise<string[]> {
    const visited = new Set<string>();
    const queue = [documentId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const parentIds = await getParentIds(current);
      for (const parentId of parentIds) {
        if (!visited.has(parentId)) {
          queue.push(parentId);
        }
      }
    }

    return Array.from(visited);
  }

  /**
   * Upsert protection status for a document.
   */
  async setDocumentProtection(
    documentId: string,
    isProtected: boolean,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("DocumentProtection")
      .values({
        documentId,
        protected: isProtected,
        ownerAddress: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.column("documentId").doUpdateSet({
          protected: isProtected,
          updatedAt: now,
        }),
      )
      .execute();
  }

  /**
   * Get the owner address for a document, or null if not set.
   */
  async getDocumentOwner(documentId: string): Promise<string | null> {
    const row = await this.db
      .selectFrom("DocumentProtection")
      .select("ownerAddress")
      .where("documentId", "=", documentId)
      .executeTakeFirst();

    return row?.ownerAddress ?? null;
  }

  /**
   * Upsert owner address for a document.
   */
  async setDocumentOwner(
    documentId: string,
    ownerAddress: string,
  ): Promise<void> {
    const now = new Date();
    const normalizedAddress = ownerAddress.toLowerCase();

    await this.db
      .insertInto("DocumentProtection")
      .values({
        documentId,
        protected: this.config.defaultProtection,
        ownerAddress: normalizedAddress,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.column("documentId").doUpdateSet({
          ownerAddress: normalizedAddress,
          updatedAt: now,
        }),
      )
      .execute();
  }

  /**
   * Initialize protection for a newly created document.
   * Sets protection status and grants ADMIN to the owner.
   */
  async initializeDocumentProtection(
    documentId: string,
    ownerAddress: string,
    defaultProtection?: boolean,
  ): Promise<void> {
    const now = new Date();
    const normalizedAddress = ownerAddress.toLowerCase();
    const isProtected = defaultProtection ?? this.config.defaultProtection;

    await this.db
      .insertInto("DocumentProtection")
      .values({
        documentId,
        protected: isProtected,
        ownerAddress: normalizedAddress,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.column("documentId").doUpdateSet({
          ownerAddress: normalizedAddress,
          updatedAt: now,
        }),
      )
      .execute();

    // Grant ADMIN permission to the owner
    await this.grantPermission(
      documentId,
      normalizedAddress,
      "ADMIN",
      normalizedAddress,
    );
  }

  /**
   * Get the full protection info for a document.
   */
  async getDocumentProtection(documentId: string): Promise<{
    documentId: string;
    protected: boolean;
    ownerAddress: string | null;
  }> {
    const row = await this.db
      .selectFrom("DocumentProtection")
      .select(["documentId", "protected", "ownerAddress"])
      .where("documentId", "=", documentId)
      .executeTakeFirst();

    if (!row) {
      return {
        documentId,
        protected: this.config.defaultProtection,
        ownerAddress: null,
      };
    }

    return row;
  }
}
