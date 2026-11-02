import type { Kysely } from "kysely";
import type {
  DocumentPermissionDatabase,
  DocumentPermissionLevel,
} from "../utils/db.js";
import {
  DEFAULT_PERMISSION_CACHE_OPTIONS,
  DocumentPermissionSnapshot,
  PermissionCache,
  type PermissionCacheOptions,
} from "./permission-cache.js";

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
  /**
   * Serves the reads authorization decisions make (protection, owner, grant
   * level, operation grants). Every write through this service invalidates
   * the document it touched.
   */
  readonly permissionCache: PermissionCache;
  readonly #listeners = new Set<(documentId: string) => void>();

  constructor(
    private readonly db: Kysely<DocumentPermissionDatabase>,
    config: DocumentPermissionConfig = { defaultProtection: false },
    cacheOptions: PermissionCacheOptions = DEFAULT_PERMISSION_CACHE_OPTIONS,
  ) {
    this.config = config;
    this.permissionCache = new PermissionCache(
      (documentIds) => this.loadPermissionSnapshots(documentIds),
      cacheOptions,
    );
  }

  /**
   * Called with the document id after every write through this service
   * (grant, revoke, protection, owner, deletion), once the cache entry is
   * invalidated: what a projection of the permission data (the readable
   * documents read model) follows. Returns the unsubscribe.
   */
  onChange(listener: (documentId: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** The one place a write ends: the cache entry goes, the listeners hear. */
  #touched(documentId: string): void {
    this.permissionCache.invalidate(documentId);
    for (const listener of this.#listeners) {
      try {
        listener(documentId);
      } catch {
        // a listener's failure is its own; the write already happened
      }
    }
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
    const snapshot = await this.permissionCache.get(documentId);
    return snapshot.grantLevel(userAddress);
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
      .execute()
      .finally(() => this.#touched(documentId));

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
      .execute()
      .finally(() => this.#touched(documentId));
  }

  /**
   * Delete all permissions for a document (used when deleting a document)
   */
  async deleteAllDocumentPermissions(documentId: string): Promise<{
    DocumentPermission: number;
    OperationUserPermission: number;
  }> {
    // RETURNING: PGlite reports no affected-row count.
    const permissions = await this.db
      .deleteFrom("DocumentPermission")
      .where("documentId", "=", documentId)
      .returning("id")
      .execute()
      .finally(() => this.#touched(documentId));

    const operations = await this.db
      .deleteFrom("OperationUserPermission")
      .where("documentId", "=", documentId)
      .returning("id")
      .execute()
      .finally(() => this.#touched(documentId));

    return {
      DocumentPermission: permissions.length,
      OperationUserPermission: operations.length,
    };
  }

  /** Delete a document's protection row, which names its owner. */
  async deleteDocumentProtection(documentId: string): Promise<number> {
    const rows = await this.db
      .deleteFrom("DocumentProtection")
      .where("documentId", "=", documentId)
      .returning("documentId")
      .execute()
      .finally(() => this.#touched(documentId));
    return rows.length;
  }

  /** Every row that names the address, for a subject access request. */
  async rowsForAddress(address: string): Promise<{
    permissions: DocumentPermissionEntry[];
    operationPermissions: OperationUserPermissionEntry[];
    ownedDocumentIds: string[];
  }> {
    const lower = address.toLowerCase();
    const permissions = await this.db
      .selectFrom("DocumentPermission")
      .select([
        "documentId",
        "userAddress",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where((eb) =>
        eb.or([eb("userAddress", "=", lower), eb("grantedBy", "=", lower)]),
      )
      .orderBy("documentId")
      .execute();
    const operationPermissions = await this.db
      .selectFrom("OperationUserPermission")
      .select([
        "documentId",
        "operationType",
        "userAddress",
        "grantedBy",
        "createdAt",
      ])
      .where((eb) =>
        eb.or([eb("userAddress", "=", lower), eb("grantedBy", "=", lower)]),
      )
      .orderBy("documentId")
      .execute();
    const owned = await this.db
      .selectFrom("DocumentProtection")
      .select("documentId")
      .where("ownerAddress", "=", lower)
      .orderBy("documentId")
      .execute();
    return {
      permissions,
      operationPermissions,
      ownedDocumentIds: owned.map((row) => row.documentId),
    };
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
      .execute()
      .finally(() => this.#touched(documentId));

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
      .execute()
      .finally(() => this.#touched(documentId));
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
    const snapshot = await this.permissionCache.get(documentId);
    return snapshot.hasOperationGrant(operationType, userAddress);
  }

  /**
   * Check if an operation has any permissions set (is restricted)
   */
  async isOperationRestricted(
    documentId: string,
    operationType: string,
  ): Promise<boolean> {
    const snapshot = await this.permissionCache.get(documentId);
    return snapshot.isOperationRestricted(operationType);
  }

  // ============================================
  // Document Protection
  // ============================================

  /**
   * Check if a specific document has a protection row set to true.
   * Falls back to `config.defaultProtection` if no row exists.
   */
  async isDocumentProtected(documentId: string): Promise<boolean> {
    const snapshot = await this.permissionCache.get(documentId);
    return snapshot.isProtected;
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

    const snapshots = await this.permissionCache.getMany(allIds);
    for (const snapshot of snapshots.values()) {
      if (snapshot.isProtected) {
        return true;
      }
    }

    return false;
  }

  /**
   * Reads the permission rows of the given documents from the store, three
   * queries for the whole batch. The permission cache's loader.
   */
  async loadPermissionSnapshots(
    documentIds: string[],
  ): Promise<Map<string, DocumentPermissionSnapshot>> {
    const protections = await this.db
      .selectFrom("DocumentProtection")
      .select(["documentId", "protected", "ownerAddress"])
      .where("documentId", "in", documentIds)
      .execute();
    const grants = await this.db
      .selectFrom("DocumentPermission")
      .select(["documentId", "userAddress", "permission"])
      .where("documentId", "in", documentIds)
      .execute();
    const operationGrants = await this.db
      .selectFrom("OperationUserPermission")
      .select(["documentId", "operationType", "userAddress"])
      .where("documentId", "in", documentIds)
      .execute();

    const protectionById = new Map(
      protections.map((row) => [row.documentId, row]),
    );
    const grantsById = new Map<string, Map<string, DocumentPermissionLevel>>();
    for (const row of grants) {
      let byUser = grantsById.get(row.documentId);
      if (!byUser) {
        byUser = new Map();
        grantsById.set(row.documentId, byUser);
      }
      byUser.set(row.userAddress, row.permission);
    }
    const operationsById = new Map<string, Map<string, Set<string>>>();
    for (const row of operationGrants) {
      let byOperation = operationsById.get(row.documentId);
      if (!byOperation) {
        byOperation = new Map();
        operationsById.set(row.documentId, byOperation);
      }
      let users = byOperation.get(row.operationType);
      if (!users) {
        users = new Set();
        byOperation.set(row.operationType, users);
      }
      users.add(row.userAddress);
    }

    const snapshots = new Map<string, DocumentPermissionSnapshot>();
    for (const documentId of documentIds) {
      const protection = protectionById.get(documentId);
      snapshots.set(
        documentId,
        new DocumentPermissionSnapshot(
          documentId,
          protection?.protected ?? this.config.defaultProtection,
          protection?.ownerAddress ?? null,
          grantsById.get(documentId) ?? new Map(),
          operationsById.get(documentId) ?? new Map(),
        ),
      );
    }
    return snapshots;
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
      .execute()
      .finally(() => this.#touched(documentId));
  }

  /**
   * Get the owner address for a document, or null if not set.
   */
  async getDocumentOwner(documentId: string): Promise<string | null> {
    const snapshot = await this.permissionCache.get(documentId);
    return snapshot.ownerAddress;
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
      .execute()
      .finally(() => this.#touched(documentId));
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
      .execute()
      .finally(() => this.#touched(documentId));

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
