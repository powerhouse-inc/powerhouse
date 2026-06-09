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
 * The policy selects an implementation once at boot:
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

/** Shared config holder and admin-list check for the policy strategies. */
abstract class BaseAuthorizationService implements IAuthorizationService {
  constructor(readonly config: AuthorizationConfig) {}

  isSupremeAdmin(userAddress?: string): boolean {
    if (!userAddress) return false;
    return this.config.admins.includes(userAddress.toLowerCase());
  }

  abstract canRead(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;

  abstract canWrite(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;

  abstract canManage(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;

  abstract canMutate(
    documentId: string,
    operationType: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean>;
}

/** OPEN: authentication disabled — everyone (incl. anonymous) is allowed. */
class OpenAuthorizationService extends BaseAuthorizationService {
  isSupremeAdmin(): boolean {
    return true;
  }

  canRead(): Promise<boolean> {
    return Promise.resolve(true);
  }

  canWrite(): Promise<boolean> {
    return Promise.resolve(true);
  }

  canManage(): Promise<boolean> {
    return Promise.resolve(true);
  }

  canMutate(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/** ADMIN_ONLY: authentication on, document permissions off — only ADMINS. */
class AdminOnlyAuthorizationService extends BaseAuthorizationService {
  canRead(_documentId: string, userAddress?: string): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }

  canWrite(_documentId: string, userAddress?: string): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }

  canManage(_documentId: string, userAddress?: string): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }

  canMutate(
    _documentId: string,
    _operationType: string,
    userAddress?: string,
  ): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }
}

/** DOCUMENT_PERMISSIONS: the full per-document protection + grant model. */
class DocumentPermissionsAuthorizationService extends BaseAuthorizationService {
  constructor(
    private readonly permissions: DocumentPermissionService,
    config: AuthorizationConfig,
  ) {
    super(config);
  }

  async canRead(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (this.isSupremeAdmin(userAddress)) return true;

    const isProtected = getParentIds
      ? await this.permissions.isProtectedWithAncestors(
          documentId,
          getParentIds,
        )
      : await this.permissions.isDocumentProtected(documentId);

    if (!isProtected) return true;
    if (!userAddress) return false;

    const owner = await this.permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    if (getParentIds) {
      return this.permissions.canRead(documentId, userAddress, getParentIds);
    }
    return this.permissions.canReadDocument(documentId, userAddress);
  }

  async canWrite(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (this.isSupremeAdmin(userAddress)) return true;
    return this.#permissionCanWrite(documentId, userAddress, getParentIds);
  }

  async canManage(documentId: string, userAddress?: string): Promise<boolean> {
    if (this.isSupremeAdmin(userAddress)) return true;
    if (!userAddress) return false;

    const owner = await this.permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    return this.permissions.canManageDocument(documentId, userAddress);
  }

  async canMutate(
    documentId: string,
    operationType: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    if (this.isSupremeAdmin(userAddress)) return true;

    const isRestricted = await this.permissions.isOperationRestricted(
      documentId,
      operationType,
    );

    if (isRestricted) {
      return this.permissions.canExecuteOperation(
        documentId,
        operationType,
        userAddress?.toLowerCase(),
      );
    }

    return this.#permissionCanWrite(documentId, userAddress, getParentIds);
  }

  async #permissionCanWrite(
    documentId: string,
    userAddress?: string,
    getParentIds?: GetParentIdsFn,
  ): Promise<boolean> {
    const isProtected = getParentIds
      ? await this.permissions.isProtectedWithAncestors(
          documentId,
          getParentIds,
        )
      : await this.permissions.isDocumentProtected(documentId);

    if (!isProtected) return true;
    if (!userAddress) return false;

    const owner = await this.permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    if (getParentIds) {
      return this.permissions.canWrite(documentId, userAddress, getParentIds);
    }
    return this.permissions.canWriteDocument(documentId, userAddress);
  }
}

/**
 * Selects the strategy for the configured policy. The strategy classes are
 * not exported, so this guard is the only construction path.
 */
export function createAuthorizationService(
  config: AuthorizationConfig,
  documentPermissionService?: DocumentPermissionService,
): IAuthorizationService {
  if (config.policy === AuthorizationPolicy.OPEN) {
    return new OpenAuthorizationService(config);
  }
  if (config.policy === AuthorizationPolicy.ADMIN_ONLY) {
    return new AdminOnlyAuthorizationService(config);
  }
  if (!documentPermissionService) {
    throw new Error(
      "DocumentPermissionService is required for the DOCUMENT_PERMISSIONS policy",
    );
  }
  return new DocumentPermissionsAuthorizationService(
    documentPermissionService,
    config,
  );
}
