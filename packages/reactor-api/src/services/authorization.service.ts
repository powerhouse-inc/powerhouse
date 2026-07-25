import type { DocumentPermissionLevel } from "../utils/db.js";
import type {
  DocumentPermissionService,
  GetParentIdsFn,
} from "./document-permission.service.js";

/**
 * A document id that has been resolved to its canonical form, never a slug.
 *
 * Protection and grant rows are written under the canonical id, while the
 * read/operation data paths accept an id-or-slug identifier. The decision layer
 * must key on the canonical id, so branding it forces every caller to resolve a
 * slug to its id before consulting this service, closing the slug-aliasing
 * bypass (S-C1). The only sanctioned cast from string to CanonicalDocumentId
 * lives in createCanonicalDocumentIdResolver, immediately after the shared
 * resolveIdOrSlug lookup returns.
 */
export type CanonicalDocumentId = string & {
  readonly __canonicalDocumentId: unique symbol;
};

/**
 * Result of a passed per-document authorization check. `fetchIdentifier` is
 * always safe for the data fetch: the canonical id when resolved, or the raw
 * identifier when the check was skipped for a policy-wide caller.
 */
export class AuthorizedDocumentHandle {
  private constructor(
    readonly fetchIdentifier: string,
    readonly isResolved: boolean,
  ) {}

  static resolved(documentId: CanonicalDocumentId): AuthorizedDocumentHandle {
    return new AuthorizedDocumentHandle(documentId, true);
  }

  static skipped(identifier: string): AuthorizedDocumentHandle {
    return new AuthorizedDocumentHandle(identifier, false);
  }

  /** The verified canonical id; throws when resolution was skipped. */
  canonicalId(): CanonicalDocumentId {
    if (!this.isResolved) {
      throw new Error(
        "Canonical document id is unavailable: the authorization check was skipped for a policy-wide caller",
      );
    }
    return this.fetchIdentifier as CanonicalDocumentId;
  }
}

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
 *
 * Permission inheritance walks the parent-document hierarchy through a
 * parent resolver injected at construction; callers never supply one.
 */
export interface IAuthorizationService {
  readonly config: AuthorizationConfig;

  /**
   * Whether the user has unrestricted, policy-wide access. Under OPEN this is
   * true for everyone (including anonymous callers) by design: OPEN means "no
   * restrictions", and consumers use this check to skip per-document
   * filtering. It does NOT mean the caller is in the ADMINS list.
   */
  isSupremeAdmin(userAddress?: string): boolean;

  /**
   * Whether the user may create new documents under the current policy:
   * everyone in OPEN, only admins in ADMIN_ONLY, any authenticated user in
   * DOCUMENT_PERMISSIONS.
   */
  canCreate(userAddress?: string): boolean;

  canRead(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean>;

  canWrite(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean>;

  /**
   * Whether the user administers the document: supreme admin, document
   * owner, or holder of an ADMIN grant.
   */
  canManage(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean>;

  canMutate(
    documentId: CanonicalDocumentId,
    operationType: string,
    userAddress?: string,
  ): Promise<boolean>;
}

/** Shared config holder and admin-list check for the policy strategies. */
abstract class BaseAuthorizationService implements IAuthorizationService {
  constructor(readonly config: AuthorizationConfig) {}

  isSupremeAdmin(userAddress?: string): boolean {
    if (!userAddress) return false;
    return this.config.admins.includes(userAddress.toLowerCase());
  }

  abstract canCreate(userAddress?: string): boolean;

  abstract canRead(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean>;

  abstract canWrite(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean>;

  abstract canManage(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean>;

  abstract canMutate(
    documentId: CanonicalDocumentId,
    operationType: string,
    userAddress?: string,
  ): Promise<boolean>;
}

/** OPEN: authentication disabled — everyone (incl. anonymous) is allowed. */
class OpenAuthorizationService extends BaseAuthorizationService {
  isSupremeAdmin(): boolean {
    return true;
  }

  canCreate(): boolean {
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
  canCreate(userAddress?: string): boolean {
    return this.isSupremeAdmin(userAddress);
  }

  canRead(
    _documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }

  canWrite(
    _documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }

  canManage(
    _documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }

  canMutate(
    _documentId: CanonicalDocumentId,
    _operationType: string,
    userAddress?: string,
  ): Promise<boolean> {
    return Promise.resolve(this.isSupremeAdmin(userAddress));
  }
}

const PERMISSION_RANK: Record<DocumentPermissionLevel, number> = {
  READ: 1,
  WRITE: 2,
  ADMIN: 3,
};

function satisfies(
  level: DocumentPermissionLevel | null,
  required: DocumentPermissionLevel,
): boolean {
  return level !== null && PERMISSION_RANK[level] >= PERMISSION_RANK[required];
}

/**
 * DOCUMENT_PERMISSIONS: the full per-document protection + grant model.
 *
 * All decisions live here; DocumentPermissionService is the data-access
 * layer underneath (grants, protection rows, owners).
 */
class DocumentPermissionsAuthorizationService extends BaseAuthorizationService {
  readonly #permissions: DocumentPermissionService;
  readonly #getParentIds: GetParentIdsFn;

  constructor(
    permissions: DocumentPermissionService,
    getParentIds: GetParentIdsFn,
    config: AuthorizationConfig,
  ) {
    super(config);
    this.#permissions = permissions;
    this.#getParentIds = getParentIds;
  }

  canCreate(userAddress?: string): boolean {
    return this.isSupremeAdmin(userAddress) || !!userAddress;
  }

  canRead(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean> {
    return this.#canAccess(documentId, "READ", userAddress);
  }

  canWrite(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean> {
    return this.#canAccess(documentId, "WRITE", userAddress);
  }

  canManage(
    documentId: CanonicalDocumentId,
    userAddress?: string,
  ): Promise<boolean> {
    return this.#isDocumentAdmin(documentId, userAddress);
  }

  async canMutate(
    documentId: CanonicalDocumentId,
    operationType: string,
    userAddress?: string,
  ): Promise<boolean> {
    if (this.isSupremeAdmin(userAddress)) return true;

    const isRestricted = await this.#permissions.isOperationRestricted(
      documentId,
      operationType,
    );
    if (isRestricted) {
      if (!userAddress) return false;
      if (await this.#isDocumentAdmin(documentId, userAddress)) return true;
      return this.#permissions.hasOperationGrant(
        documentId,
        operationType,
        userAddress,
      );
    }

    return this.#canAccess(documentId, "WRITE", userAddress);
  }

  /**
   * The one "administers this document" predicate: supreme admin, document
   * owner, or ADMIN grant on the document itself.
   */
  async #isDocumentAdmin(
    documentId: string,
    userAddress?: string,
  ): Promise<boolean> {
    if (this.isSupremeAdmin(userAddress)) return true;
    if (!userAddress) return false;

    const owner = await this.#permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    return satisfies(await this.#grantLevel(documentId, userAddress), "ADMIN");
  }

  /**
   * The one read/write decision shape: supreme admin → unprotected (self or
   * ancestor) → owner → inherited grant of at least the required level.
   */
  async #canAccess(
    documentId: string,
    required: DocumentPermissionLevel,
    userAddress?: string,
  ): Promise<boolean> {
    if (this.isSupremeAdmin(userAddress)) return true;

    const isProtected = await this.#permissions.isProtectedWithAncestors(
      documentId,
      this.#getParentIds,
    );
    if (!isProtected) return true;
    if (!userAddress) return false;

    const owner = await this.#permissions.getDocumentOwner(documentId);
    if (owner && owner === userAddress.toLowerCase()) return true;

    return this.#hasGrantInHierarchy(documentId, userAddress, required);
  }

  /** Best grant the user holds on the document. */
  async #grantLevel(
    documentId: string,
    userAddress: string,
  ): Promise<DocumentPermissionLevel | null> {
    return this.#permissions.getUserPermission(documentId, userAddress);
  }

  /**
   * Walks the parent hierarchy (with cycle protection) looking for a grant of
   * at least the required level on the document or any ancestor.
   */
  async #hasGrantInHierarchy(
    documentId: string,
    userAddress: string,
    required: DocumentPermissionLevel,
  ): Promise<boolean> {
    const visited = new Set<string>();
    const queue = [documentId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      const level = await this.#grantLevel(current, userAddress);
      if (satisfies(level, required)) return true;

      for (const parentId of await this.#getParentIds(current)) {
        if (!visited.has(parentId)) queue.push(parentId);
      }
    }

    return false;
  }
}

/**
 * Selects the strategy for the configured policy. The strategy classes are
 * not exported, so this guard is the only construction path.
 */
export function createAuthorizationService(
  config: AuthorizationConfig,
  documentPermissionService?: DocumentPermissionService,
  getParentIds?: GetParentIdsFn,
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
  if (!getParentIds) {
    throw new Error(
      "A getParentIds resolver is required for the DOCUMENT_PERMISSIONS policy",
    );
  }
  return new DocumentPermissionsAuthorizationService(
    documentPermissionService,
    getParentIds,
    config,
  );
}
