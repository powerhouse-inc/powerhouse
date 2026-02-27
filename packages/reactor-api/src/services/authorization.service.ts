import type {
  DocumentPermissionService,
  GetParentIdsFn,
} from "./document-permission.service.js";

export interface AuthorizationConfig {
  admins: string[];
  defaultProtection: boolean;
}

/**
 * Central authorization service — single source of truth for all permission checks.
 *
 * Authorization model:
 * 1. Supreme admin (ADMINS env) → ALLOW ALL
 * 2. Is document protected?
 *    a. NOT protected:
 *       - READ: anyone (even anonymous) → ALLOW
 *       - WRITE: authenticated user → ALLOW
 *    b. PROTECTED:
 *       - READ: requires explicit READ/WRITE/ADMIN grant (direct or via group/parent)
 *       - WRITE: requires explicit WRITE/ADMIN grant (direct or via group/parent)
 * 3. Operation restricted? → Check OperationUserPermission
 * 4. Document owner = implicit ADMIN
 * 5. Drive protected = all children effectively protected
 */
export class AuthorizationService {
  readonly config: AuthorizationConfig;

  constructor(
    private readonly documentPermissionService: DocumentPermissionService,
    config: AuthorizationConfig,
  ) {
    this.config = config;
  }

  /**
   * Check if a user is a supreme admin (from ADMINS env var).
   */
  isSupremeAdmin(userAddress?: string): boolean {
    if (!userAddress) return false;
    return this.config.admins.includes(userAddress.toLowerCase());
  }

  /**
   * Check if a user can read a document.
   *
   * - Supreme admin → yes
   * - Not protected → anyone can read (even anonymous)
   * - Protected → requires READ/WRITE/ADMIN grant (direct, group, or parent inheritance)
   * - Owner → yes (implicit ADMIN)
   */
  async canRead(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    // Supreme admin bypasses all
    if (this.isSupremeAdmin(userAddress)) return true;

    // Check protection status (walks parent chain if getParentIds provided)
    const isProtected = getParentIds
      ? await this.documentPermissionService.isProtectedWithAncestors(
          documentId,
          getParentIds,
        )
      : await this.documentPermissionService.isDocumentProtected(documentId);

    // Unprotected documents are readable by anyone
    if (!isProtected) return true;

    // Protected document — requires authentication
    if (!userAddress) return false;

    // Owner has implicit ADMIN
    const owner =
      await this.documentPermissionService.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    // Check grant (READ/WRITE/ADMIN all allow reading)
    if (getParentIds) {
      return this.documentPermissionService.canRead(
        documentId,
        userAddress,
        getParentIds,
      );
    }
    return this.documentPermissionService.canReadDocument(
      documentId,
      userAddress,
    );
  }

  /**
   * Check if a user can write to a document.
   *
   * - Supreme admin → yes
   * - Not protected → anyone can write (even anonymous)
   * - Protected → requires authentication + WRITE/ADMIN grant
   * - Owner → yes (implicit ADMIN)
   */
  async canWrite(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    // Supreme admin bypasses all
    if (this.isSupremeAdmin(userAddress)) return true;

    // Check protection status
    const isProtected = getParentIds
      ? await this.documentPermissionService.isProtectedWithAncestors(
          documentId,
          getParentIds,
        )
      : await this.documentPermissionService.isDocumentProtected(documentId);

    // Unprotected documents are writable by anyone (even anonymous)
    if (!isProtected) return true;

    // Protected document — requires authentication
    if (!userAddress) return false;

    // Owner has implicit ADMIN
    const owner =
      await this.documentPermissionService.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    // Check grant (WRITE/ADMIN allow writing)
    if (getParentIds) {
      return this.documentPermissionService.canWrite(
        documentId,
        userAddress,
        getParentIds,
      );
    }
    return this.documentPermissionService.canWriteDocument(
      documentId,
      userAddress,
    );
  }

  /**
   * Check if a user can manage a document (change permissions, protection, transfer ownership).
   *
   * - Supreme admin → yes
   * - Owner → yes
   * - Has ADMIN grant → yes
   */
  async canManage(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    // Supreme admin bypasses all
    if (this.isSupremeAdmin(userAddress)) return true;

    if (!userAddress) return false;

    // Owner has implicit ADMIN
    const owner =
      await this.documentPermissionService.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    // Check ADMIN grant
    return this.documentPermissionService.canManageDocument(
      documentId,
      userAddress,
    );
  }

  /**
   * Check if a user can execute a specific operation.
   * If the operation is not restricted, falls through to the standard write check.
   * If the operation is restricted, requires an explicit OperationUserPermission grant.
   */
  async canExecuteOperation(
    documentId: string,
    operationType: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    // Supreme admin bypasses all
    if (this.isSupremeAdmin(userAddress)) return true;

    // Check if operation is restricted
    const isRestricted =
      await this.documentPermissionService.isOperationRestricted(
        documentId,
        operationType,
      );

    if (!isRestricted) {
      // Operation not restricted — standard write check applies
      return this.canWrite(documentId, userAddress, getParentIds);
    }

    // Operation is restricted — user needs explicit operation grant
    return this.documentPermissionService.canExecuteOperation(
      documentId,
      operationType,
      userAddress?.toLowerCase(),
    );
  }

  /**
   * Combined check for mutations: can the user write + execute the operation?
   * This enables READ-only users with operation grants to execute specific operations.
   * For restricted operations, only the operation grant is checked (bypasses write check),
   * allowing READ-only users with an explicit operation grant to execute that operation.
   */
  async canMutate(
    documentId: string,
    operationType: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    // Supreme admin bypasses all
    if (this.isSupremeAdmin(userAddress)) return true;

    // Check if the operation is restricted
    const isRestricted =
      await this.documentPermissionService.isOperationRestricted(
        documentId,
        operationType,
      );

    if (isRestricted) {
      // For restricted operations, only the operation grant matters
      // This allows READ-only users with operation grants to execute
      return this.documentPermissionService.canExecuteOperation(
        documentId,
        operationType,
        userAddress?.toLowerCase(),
      );
    }

    // For unrestricted operations, standard write check applies
    return this.canWrite(documentId, userAddress, getParentIds);
  }
}
