import { GraphQLError } from "graphql";
import type {
  DocumentPermissionService,
  GetParentIdsFn,
} from "../../services/document-permission.service.js";
import type { DocumentPermissionLevel } from "../../utils/db.js";
import type { IReactorClient } from "@powerhousedao/reactor";

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
  groupPermissions: Array<{
    documentId: string;
    groupId: number;
    permission: DocumentPermissionLevel;
    grantedBy: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
};

export async function documentAccess(
  service: DocumentPermissionService,
  args: { documentId: string },
): Promise<DocumentAccessInfo> {
  const permissions = await service.getDocumentPermissions(args.documentId);
  const groupPermissions = await service.getDocumentGroupPermissions(
    args.documentId,
  );

  return {
    documentId: args.documentId,
    permissions,
    groupPermissions,
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
  args: {
    documentId: string;
    userAddress: string;
    permission: DocumentPermissionLevel;
  },
  grantedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<{
  documentId: string;
  userAddress: string;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  // Check authorization: must be global admin or document admin
  if (!grantedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      grantedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to grant permissions",
      );
    }
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
  args: { documentId: string; userAddress: string },
  revokedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<boolean> {
  // Check authorization: must be global admin or document admin
  if (!revokedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      revokedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to revoke permissions",
      );
    }
  }

  await service.revokePermission(args.documentId, args.userAddress);
  return true;
}

/**
 * Create a getParentIds function using the reactor client
 */
export function createGetParentIdsFn(
  reactorClient: IReactorClient,
): GetParentIdsFn {
  return async (documentId: string): Promise<string[]> => {
    try {
      const result = await reactorClient.getParents(documentId);
      return result.results.map((doc) => doc.header.id);
    } catch {
      // If document has no parents or error, return empty array
      return [];
    }
  };
}

// ============================================
// Group Resolvers
// ============================================

export type Group = {
  id: number;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export async function groups(
  service: DocumentPermissionService,
): Promise<Group[]> {
  return service.listGroups();
}

export async function group(
  service: DocumentPermissionService,
  args: { id: number },
): Promise<Group | null> {
  return service.getGroup(args.id);
}

export async function userGroups(
  service: DocumentPermissionService,
  args: { userAddress: string },
): Promise<Group[]> {
  return service.getUserGroups(args.userAddress);
}

export async function createGroup(
  service: DocumentPermissionService,
  args: { name: string; description?: string | null },
): Promise<Group> {
  return service.createGroup(args.name, args.description ?? undefined);
}

export async function deleteGroup(
  service: DocumentPermissionService,
  args: { id: number },
): Promise<boolean> {
  await service.deleteGroup(args.id);
  return true;
}

export async function addUserToGroup(
  service: DocumentPermissionService,
  args: { userAddress: string; groupId: number },
): Promise<boolean> {
  await service.addUserToGroup(args.userAddress, args.groupId);
  return true;
}

export async function removeUserFromGroup(
  service: DocumentPermissionService,
  args: { userAddress: string; groupId: number },
): Promise<boolean> {
  await service.removeUserFromGroup(args.userAddress, args.groupId);
  return true;
}

export async function getGroupMembers(
  service: DocumentPermissionService,
  groupId: number,
): Promise<string[]> {
  return service.getGroupMembers(groupId);
}

// ============================================
// Group Document Permission Resolvers
// ============================================

export type DocumentGroupPermission = {
  documentId: string;
  groupId: number;
  permission: DocumentPermissionLevel;
  grantedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export async function grantGroupPermission(
  service: DocumentPermissionService,
  args: {
    documentId: string;
    groupId: number;
    permission: DocumentPermissionLevel;
  },
  grantedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<DocumentGroupPermission> {
  // Check authorization: must be global admin or document admin
  if (!grantedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      grantedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to grant permissions",
      );
    }
  }

  return service.grantGroupPermission(
    args.documentId,
    args.groupId,
    args.permission,
    grantedByAddress,
  );
}

export async function revokeGroupPermission(
  service: DocumentPermissionService,
  args: { documentId: string; groupId: number },
  revokedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<boolean> {
  // Check authorization: must be global admin or document admin
  if (!revokedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      revokedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to revoke permissions",
      );
    }
  }

  await service.revokeGroupPermission(args.documentId, args.groupId);
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

export type OperationGroupPermission = {
  documentId: string;
  operationType: string;
  groupId: number;
  grantedBy: string;
  createdAt: Date;
};

export type OperationPermissionsInfo = {
  documentId: string;
  operationType: string;
  userPermissions: OperationUserPermission[];
  groupPermissions: OperationGroupPermission[];
};

export async function operationPermissions(
  service: DocumentPermissionService,
  args: { documentId: string; operationType: string },
): Promise<OperationPermissionsInfo> {
  const userPermissions = await service.getOperationUserPermissions(
    args.documentId,
    args.operationType,
  );
  const groupPermissions = await service.getOperationGroupPermissions(
    args.documentId,
    args.operationType,
  );

  return {
    documentId: args.documentId,
    operationType: args.operationType,
    userPermissions,
    groupPermissions,
  };
}

export async function canExecuteOperation(
  service: DocumentPermissionService,
  args: { documentId: string; operationType: string },
  userAddress: string | undefined,
): Promise<boolean> {
  return service.canExecuteOperation(
    args.documentId,
    args.operationType,
    userAddress,
  );
}

export async function grantOperationPermission(
  service: DocumentPermissionService,
  args: { documentId: string; operationType: string; userAddress: string },
  grantedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<OperationUserPermission> {
  if (!grantedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      grantedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to grant operation permissions",
      );
    }
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
  args: { documentId: string; operationType: string; userAddress: string },
  revokedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<boolean> {
  if (!revokedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      revokedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to revoke operation permissions",
      );
    }
  }

  await service.revokeOperationPermission(
    args.documentId,
    args.operationType,
    args.userAddress,
  );
  return true;
}

export async function grantGroupOperationPermission(
  service: DocumentPermissionService,
  args: { documentId: string; operationType: string; groupId: number },
  grantedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<OperationGroupPermission> {
  if (!grantedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      grantedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to grant operation permissions",
      );
    }
  }

  return service.grantGroupOperationPermission(
    args.documentId,
    args.operationType,
    args.groupId,
    grantedByAddress,
  );
}

export async function revokeGroupOperationPermission(
  service: DocumentPermissionService,
  args: { documentId: string; operationType: string; groupId: number },
  revokedByAddress: string | undefined,
  isGlobalAdmin: boolean,
): Promise<boolean> {
  if (!revokedByAddress) {
    throw new GraphQLError("Authentication required");
  }

  if (!isGlobalAdmin) {
    const canManage = await service.canManageDocument(
      args.documentId,
      revokedByAddress,
    );
    if (!canManage) {
      throw new GraphQLError(
        "Forbidden: You must be an admin of this document to revoke operation permissions",
      );
    }
  }

  await service.revokeGroupOperationPermission(
    args.documentId,
    args.operationType,
    args.groupId,
  );
  return true;
}
