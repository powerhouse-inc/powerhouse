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

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS "documentpermission_documentid_index" ON "DocumentPermission" ("documentId")`.execute(
      this.db,
    );
    await sql`CREATE INDEX IF NOT EXISTS "documentpermission_useraddress_index" ON "DocumentPermission" ("userAddress")`.execute(
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
  async getDocumentVisibility(
    documentId: string,
  ): Promise<DocumentVisibility> {
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
   * - Document is PROTECTED and user has READ, WRITE, or ADMIN permission
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

    // PROTECTED: check user permission
    if (!userAddress) {
      return false;
    }

    const permission = await this.getUserPermission(documentId, userAddress);
    return permission !== null; // Any permission level allows reading
  }

  /**
   * Check if a user can write to a single document (without parent checks).
   * Returns true if:
   * - Document is PUBLIC (global permissions should gate this)
   * - Document is PROTECTED and user has WRITE or ADMIN permission
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

    // PROTECTED: check user permission
    if (!userAddress) {
      return false;
    }

    const permission = await this.getUserPermission(documentId, userAddress);
    return permission === "WRITE" || permission === "ADMIN";
  }

  /**
   * Check if a user can manage a document (change permissions, settings).
   * Returns true if:
   * - Document is PROTECTED and user has ADMIN permission
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

    const permission = await this.getUserPermission(documentId, userAddress);
    return permission === "ADMIN";
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
}
