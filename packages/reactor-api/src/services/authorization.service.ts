import type {
  DocumentPermissionService,
  GetParentIdsFn,
} from "./document-permission.service.js";

export const AuthorizationPolicy = {
  OPEN: "OPEN",
  ADMIN_ONLY: "ADMIN_ONLY",
  DOCUMENT_PERMISSIONS: "DOCUMENT_PERMISSIONS",
} as const;

export type AuthorizationPolicy =
  (typeof AuthorizationPolicy)[keyof typeof AuthorizationPolicy];

export interface AuthorizationConfig {
  admins: string[];
  defaultProtection: boolean;
  policy: AuthorizationPolicy;
}

/**
 * Single source of truth for every permission decision. Always present (never
 * null) so callers branch on data, not on the existence of a service.
 *
 * The policy selects behavior once at boot:
 * - OPEN: authentication disabled — everyone (incl. anonymous) is allowed.
 * - ADMIN_ONLY: authentication on, document permissions off — only ADMINS.
 * - DOCUMENT_PERMISSIONS: the full per-document protection + grant model.
 */
export interface IAuthorizationService {
  readonly config: AuthorizationConfig;

  isSupremeAdmin(userAddress?: string): boolean;

  canRead(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;

  canWrite(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;

  canManage(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;

  canMutate(
    documentId: string,
    operationType: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;
}

export class AuthorizationService implements IAuthorizationService {
  readonly config: AuthorizationConfig;

  constructor(
    private readonly documentPermissionService:
      | DocumentPermissionService
      | undefined,
    config: AuthorizationConfig,
  ) {
    if (
      config.policy === AuthorizationPolicy.DOCUMENT_PERMISSIONS &&
      !documentPermissionService
    ) {
      throw new Error(
        "DocumentPermissionService is required for the DOCUMENT_PERMISSIONS policy",
      );
    }
    this.config = config;
  }

  isSupremeAdmin(userAddress?: string): boolean {
    if (this.config.policy === AuthorizationPolicy.OPEN) return true;
    if (!userAddress) return false;
    return this.config.admins.includes(userAddress.toLowerCase());
  }

  async canRead(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (this.config.policy === AuthorizationPolicy.OPEN) return true;
    if (this.isSupremeAdmin(userAddress)) return true;
    if (this.config.policy === AuthorizationPolicy.ADMIN_ONLY) return false;
    return this.#permissionCanRead(documentId, userAddress, getParentIds);
  }

  async canWrite(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (this.config.policy === AuthorizationPolicy.OPEN) return true;
    if (this.isSupremeAdmin(userAddress)) return true;
    if (this.config.policy === AuthorizationPolicy.ADMIN_ONLY) return false;
    return this.#permissionCanWrite(documentId, userAddress, getParentIds);
  }

  async canManage(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (this.config.policy === AuthorizationPolicy.OPEN) return true;
    if (this.isSupremeAdmin(userAddress)) return true;
    if (this.config.policy === AuthorizationPolicy.ADMIN_ONLY) return false;
    return this.#permissionCanManage(documentId, userAddress, getParentIds);
  }

  async canMutate(
    documentId: string,
    operationType: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (this.config.policy === AuthorizationPolicy.OPEN) return true;
    if (this.isSupremeAdmin(userAddress)) return true;
    if (this.config.policy === AuthorizationPolicy.ADMIN_ONLY) return false;
    return this.#permissionCanMutate(
      documentId,
      operationType,
      userAddress,
      getParentIds,
    );
  }

  #permissions(): DocumentPermissionService {
    if (!this.documentPermissionService) {
      throw new Error("DocumentPermissionService is not available");
    }
    return this.documentPermissionService;
  }

  async #permissionCanRead(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    const permissions = this.#permissions();
    const isProtected = getParentIds
      ? await permissions.isProtectedWithAncestors(documentId, getParentIds)
      : await permissions.isDocumentProtected(documentId);

    if (!isProtected) return true;
    if (!userAddress) return false;

    const owner = await permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    if (getParentIds) {
      return permissions.canRead(documentId, userAddress, getParentIds);
    }
    return permissions.canReadDocument(documentId, userAddress);
  }

  async #permissionCanWrite(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    const permissions = this.#permissions();
    const isProtected = getParentIds
      ? await permissions.isProtectedWithAncestors(documentId, getParentIds)
      : await permissions.isDocumentProtected(documentId);

    if (!isProtected) return true;
    if (!userAddress) return false;

    const owner = await permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    if (getParentIds) {
      return permissions.canWrite(documentId, userAddress, getParentIds);
    }
    return permissions.canWriteDocument(documentId, userAddress);
  }

  async #permissionCanManage(
    documentId: string,
    userAddress?: string,
    _getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (!userAddress) return false;

    const permissions = this.#permissions();
    const owner = await permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    return permissions.canManageDocument(documentId, userAddress);
  }

  async #permissionCanMutate(
    documentId: string,
    operationType: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    const permissions = this.#permissions();
    const isRestricted = await permissions.isOperationRestricted(
      documentId,
      operationType,
    );

    if (isRestricted) {
      return permissions.canExecuteOperation(
        documentId,
        operationType,
        userAddress?.toLowerCase(),
      );
    }

    return this.#permissionCanWrite(documentId, userAddress, getParentIds);
  }
}
