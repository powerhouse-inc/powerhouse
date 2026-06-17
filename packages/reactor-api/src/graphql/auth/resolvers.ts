import { GraphQLError } from "graphql";
import type {
  CanonicalDocumentId,
  IAuthorizationService,
} from "../../services/authorization.service.js";
import type { DocumentPermissionService } from "../../services/document-permission.service.js";
import type { DocumentPermissionLevel } from "../../utils/db.js";

// ============================================
// Document Permission Resolvers
// ============================================

export type DocumentAccessInfo = {
  documentId: string;
  permissions: Array<{
    documentId: string;
    userAddress: string;
    permission: DocumentPermissionLevel;
    grantedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export async function documentAccess(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: { documentId: CanonicalDocumentId },
  userAddress: string | undefined,
): Promise<DocumentAccessInfo> {
  if (!userAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    userAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to view its permissions",
    );
  }

  const permissions = await service.getDocumentPermissions(args.documentId);

  return {
    documentId: args.documentId,
    permissions,
  };
}

export async function userDocumentPermissions(
  service: DocumentPermissionService,
  userAddress: string,
): Promise<
  Array<{
    documentId: string;
    userAddress: string;
    permission: DocumentPermissionLevel;
    grantedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }>
> {
  return service.getUserDocuments(userAddress);
}

export async function grantDocumentPermission(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: {
    documentId: CanonicalDocumentId;
    userAddress: string;
    permission: DocumentPermissionLevel;
  },
  grantedByAddress: string | undefined,
): Promise<{
  documentId: string;
  userAddress: string;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  if (!grantedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    grantedByAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to grant permissions",
    );
  }

  return service.grantPermission(
    args.documentId,
    args.userAddress,
    args.permission,
    grantedByAddress,
  );
}

export async function revokeDocumentPermission(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: { documentId: CanonicalDocumentId; userAddress: string },
  revokedByAddress: string | undefined,
): Promise<boolean> {
  if (!revokedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    revokedByAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to revoke permissions",
    );
  }

  await service.revokePermission(args.documentId, args.userAddress);
  return true;
}

// ============================================
// Operation Permission Resolvers
// ============================================

export type OperationUserPermission = {
  documentId: string;
  operationType: string;
  userAddress: string;
  grantedBy: string;
  createdAt: Date;
};

export type OperationPermissionsInfo = {
  documentId: string;
  operationType: string;
  userPermissions: OperationUserPermission[];
};

export async function operationPermissions(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: { documentId: CanonicalDocumentId; operationType: string },
  userAddress: string | undefined,
): Promise<OperationPermissionsInfo> {
  if (!userAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    userAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to view its operation permissions",
    );
  }

  const userPermissions = await service.getOperationUserPermissions(
    args.documentId,
    args.operationType,
  );

  return {
    documentId: args.documentId,
    operationType: args.operationType,
    userPermissions,
  };
}

export async function canExecuteOperation(
  authorizationService: IAuthorizationService,
  args: { documentId: CanonicalDocumentId; operationType: string },
  userAddress: string | undefined,
): Promise<boolean> {
  return authorizationService.canMutate(
    args.documentId,
    args.operationType,
    userAddress,
  );
}

export async function grantOperationPermission(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: {
    documentId: CanonicalDocumentId;
    operationType: string;
    userAddress: string;
  },
  grantedByAddress: string | undefined,
): Promise<OperationUserPermission> {
  if (!grantedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    grantedByAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to grant operation permissions",
    );
  }

  return service.grantOperationPermission(
    args.documentId,
    args.operationType,
    args.userAddress,
    grantedByAddress,
  );
}

export async function revokeOperationPermission(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: {
    documentId: CanonicalDocumentId;
    operationType: string;
    userAddress: string;
  },
  revokedByAddress: string | undefined,
): Promise<boolean> {
  if (!revokedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    revokedByAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to revoke operation permissions",
    );
  }

  await service.revokeOperationPermission(
    args.documentId,
    args.operationType,
    args.userAddress,
  );
  return true;
}

// ============================================
// Document Protection Resolvers
// ============================================

export type DocumentProtectionInfo = {
  documentId: string;
  protected: boolean;
  ownerAddress: string | null;
};

export async function documentProtection(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: { documentId: CanonicalDocumentId },
  userAddress: string | undefined,
): Promise<DocumentProtectionInfo> {
  if (!userAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    userAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to view its protection info",
    );
  }

  return service.getDocumentProtection(args.documentId);
}

export async function setDocumentProtection(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: { documentId: CanonicalDocumentId; protected: boolean },
  userAddress: string | undefined,
): Promise<DocumentProtectionInfo> {
  if (!userAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    userAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to change protection",
    );
  }

  await service.setDocumentProtection(args.documentId, args.protected);
  return service.getDocumentProtection(args.documentId);
}

export async function transferDocumentOwnership(
  service: DocumentPermissionService,
  authorizationService: IAuthorizationService,
  args: { documentId: CanonicalDocumentId; newOwnerAddress: string },
  userAddress: string | undefined,
): Promise<DocumentProtectionInfo> {
  if (!userAddress) {
    throw new GraphQLError("Authentication required");
  }

  const canManage = await authorizationService.canManage(
    args.documentId,
    userAddress,
  );
  if (!canManage) {
    throw new GraphQLError(
      "Forbidden: You must be an admin of this document to transfer ownership",
    );
  }

  // Revoke old owner's explicit ADMIN grant before transferring
  const previousOwner = await service.getDocumentOwner(args.documentId);
  if (previousOwner) {
    await service.revokePermission(args.documentId, previousOwner);
  }

  await service.setDocumentOwner(args.documentId, args.newOwnerAddress);

  // Grant ADMIN to new owner
  await service.grantPermission(
    args.documentId,
    args.newOwnerAddress,
    "ADMIN",
    userAddress,
  );

  return service.getDocumentProtection(args.documentId);
}
