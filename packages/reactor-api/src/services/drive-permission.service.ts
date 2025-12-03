import type { Kysely } from "kysely";
import { sql } from "kysely";
import type {
  DrivePermissionDatabase,
  DrivePermissionLevel,
  DriveVisibility,
} from "../utils/db.js";

export interface DrivePermissionEntry {
  driveId: string;
  userAddress: string;
  permission: DrivePermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DriveVisibilityEntry {
  driveId: string;
  visibility: DriveVisibility;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Service for managing drive-level permissions.
 *
 * Drive visibility levels:
 * - PUBLIC: Anyone can read/sync the drive (default)
 * - PROTECTED: Only users with explicit permissions can access
 * - PRIVATE: Drive is not synced at all (local only)
 *
 * Permission levels for protected drives:
 * - READ: Can fetch strands and read documents
 * - WRITE: Can push updates and modify documents
 * - ADMIN: Can manage drive permissions and settings
 */
export class DrivePermissionService {
  private initialized = false;

  constructor(private readonly db: Kysely<DrivePermissionDatabase>) {}

  /**
   * Initialize the database tables for drive permissions
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create DriveVisibility table
    await sql`
      CREATE TABLE IF NOT EXISTS "DriveVisibility" (
        "driveId" VARCHAR(255) PRIMARY KEY,
        "visibility" VARCHAR(20) NOT NULL DEFAULT 'PUBLIC' CHECK ("visibility" IN ('PUBLIC', 'PROTECTED', 'PRIVATE')),
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `.execute(this.db);

    // Create DrivePermission table
    await sql`
      CREATE TABLE IF NOT EXISTS "DrivePermission" (
        "id" SERIAL PRIMARY KEY,
        "driveId" VARCHAR(255) NOT NULL,
        "userAddress" VARCHAR(255) NOT NULL,
        "permission" VARCHAR(20) NOT NULL CHECK ("permission" IN ('READ', 'WRITE', 'ADMIN')),
        "grantedBy" VARCHAR(255) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE ("driveId", "userAddress")
      )
    `.execute(this.db);

    // Create indexes
    await sql`CREATE INDEX IF NOT EXISTS "drivepermission_driveid_index" ON "DrivePermission" ("driveId")`.execute(
      this.db,
    );
    await sql`CREATE INDEX IF NOT EXISTS "drivepermission_useraddress_index" ON "DrivePermission" ("userAddress")`.execute(
      this.db,
    );

    this.initialized = true;
  }

  // ============================================
  // Drive Visibility Operations
  // ============================================

  /**
   * Get the visibility level for a drive.
   * Returns 'PUBLIC' if no explicit visibility is set.
   */
  async getDriveVisibility(driveId: string): Promise<DriveVisibility> {
    const result = await this.db
      .selectFrom("DriveVisibility")
      .select("visibility")
      .where("driveId", "=", driveId)
      .executeTakeFirst();

    return result?.visibility ?? "PUBLIC";
  }

  /**
   * Set the visibility level for a drive.
   * Creates a new entry or updates existing one.
   */
  async setDriveVisibility(
    driveId: string,
    visibility: DriveVisibility,
  ): Promise<void> {
    const now = new Date();

    await this.db
      .insertInto("DriveVisibility")
      .values({
        driveId,
        visibility,
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.column("driveId").doUpdateSet({
          visibility,
          updatedAt: now,
        }),
      )
      .execute();
  }

  /**
   * Delete visibility entry for a drive (resets to default PUBLIC)
   */
  async deleteDriveVisibility(driveId: string): Promise<void> {
    await this.db
      .deleteFrom("DriveVisibility")
      .where("driveId", "=", driveId)
      .execute();
  }

  // ============================================
  // User Permission Operations
  // ============================================

  /**
   * Get the permission level for a user on a specific drive.
   * Returns null if no permission is set.
   */
  async getUserPermission(
    driveId: string,
    userAddress: string,
  ): Promise<DrivePermissionLevel | null> {
    const result = await this.db
      .selectFrom("DrivePermission")
      .select("permission")
      .where("driveId", "=", driveId)
      .where("userAddress", "=", userAddress.toLowerCase())
      .executeTakeFirst();

    return result?.permission ?? null;
  }

  /**
   * Get all permissions for a drive
   */
  async getDrivePermissions(driveId: string): Promise<DrivePermissionEntry[]> {
    const results = await this.db
      .selectFrom("DrivePermission")
      .select([
        "driveId",
        "userAddress",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where("driveId", "=", driveId)
      .execute();

    return results;
  }

  /**
   * Get all drives a user has access to
   */
  async getUserDrives(userAddress: string): Promise<DrivePermissionEntry[]> {
    const results = await this.db
      .selectFrom("DrivePermission")
      .select([
        "driveId",
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
   * Grant or update a user's permission on a drive.
   * Only users with ADMIN permission (or global admins) can grant permissions.
   */
  async grantPermission(
    driveId: string,
    userAddress: string,
    permission: DrivePermissionLevel,
    grantedBy: string,
  ): Promise<DrivePermissionEntry> {
    const now = new Date();
    const normalizedAddress = userAddress.toLowerCase();

    await this.db
      .insertInto("DrivePermission")
      .values({
        driveId,
        userAddress: normalizedAddress,
        permission,
        grantedBy: grantedBy.toLowerCase(),
        createdAt: now,
        updatedAt: now,
      })
      .onConflict((oc) =>
        oc.columns(["driveId", "userAddress"]).doUpdateSet({
          permission,
          grantedBy: grantedBy.toLowerCase(),
          updatedAt: now,
        }),
      )
      .execute();

    const result = await this.db
      .selectFrom("DrivePermission")
      .select([
        "driveId",
        "userAddress",
        "permission",
        "grantedBy",
        "createdAt",
        "updatedAt",
      ])
      .where("driveId", "=", driveId)
      .where("userAddress", "=", normalizedAddress)
      .executeTakeFirstOrThrow();

    return result;
  }

  /**
   * Revoke a user's permission on a drive
   */
  async revokePermission(driveId: string, userAddress: string): Promise<void> {
    await this.db
      .deleteFrom("DrivePermission")
      .where("driveId", "=", driveId)
      .where("userAddress", "=", userAddress.toLowerCase())
      .execute();
  }

  /**
   * Delete all permissions for a drive (used when deleting a drive)
   */
  async deleteAllDrivePermissions(driveId: string): Promise<void> {
    await this.db
      .deleteFrom("DrivePermission")
      .where("driveId", "=", driveId)
      .execute();
  }

  // ============================================
  // Access Control Checks
  // ============================================

  /**
   * Check if a user can read from a drive.
   * Returns true if:
   * - Drive is PUBLIC
   * - Drive is PROTECTED and user has READ, WRITE, or ADMIN permission
   */
  async canRead(
    driveId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    const visibility = await this.getDriveVisibility(driveId);

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

    const permission = await this.getUserPermission(driveId, userAddress);
    return permission !== null; // Any permission level allows reading
  }

  /**
   * Check if a user can write to a drive.
   * Returns true if:
   * - Drive is PUBLIC (for now, global permissions should gate this)
   * - Drive is PROTECTED and user has WRITE or ADMIN permission
   */
  async canWrite(
    driveId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    const visibility = await this.getDriveVisibility(driveId);

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

    const permission = await this.getUserPermission(driveId, userAddress);
    return permission === "WRITE" || permission === "ADMIN";
  }

  /**
   * Check if a user can manage a drive (change permissions, settings).
   * Returns true if:
   * - Drive is PROTECTED and user has ADMIN permission
   */
  async canManage(
    driveId: string,
    userAddress: string | undefined,
  ): Promise<boolean> {
    if (!userAddress) {
      return false;
    }

    const visibility = await this.getDriveVisibility(driveId);

    if (visibility === "PRIVATE") {
      return false;
    }

    const permission = await this.getUserPermission(driveId, userAddress);
    return permission === "ADMIN";
  }

  /**
   * Check if a drive is syncable (not PRIVATE)
   */
  async isSyncable(driveId: string): Promise<boolean> {
    const visibility = await this.getDriveVisibility(driveId);
    return visibility !== "PRIVATE";
  }
}
