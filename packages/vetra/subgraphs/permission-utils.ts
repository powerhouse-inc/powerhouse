import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { GraphQLError } from "graphql";

/**
 * Get the parent IDs function for hierarchical permission checks
 */
function getParentIdsFn(subgraph: BaseSubgraph) {
  return async (documentId: string): Promise<string[]> => {
    try {
      const result = await subgraph.reactorClient.getParents(documentId);
      return result.results.map((doc) => doc.header.id);
    } catch {
      return [];
    }
  };
}

/**
 * Check if user has global admin access.
 * Legacy fallback when authorizationService is not available.
 */
export function hasGlobalAdminAccess(ctx: Context): boolean {
  return !!ctx.isAdmin?.(ctx.user?.address ?? "");
}

/**
 * Check if user can read a document (with hierarchy).
 * Delegates to AuthorizationService when available.
 */
export async function canReadDocument(
  subgraph: BaseSubgraph,
  documentId: string,
  ctx: Context,
): Promise<boolean> {
  if (subgraph.authorizationService) {
    return subgraph.authorizationService.canRead(
      documentId,
      ctx.user?.address,
      getParentIdsFn(subgraph),
    );
  }
  // Legacy fallback
  if (hasGlobalAdminAccess(ctx)) return true;
  if (subgraph.documentPermissionService) {
    return subgraph.documentPermissionService.canRead(
      documentId,
      ctx.user?.address,
      getParentIdsFn(subgraph),
    );
  }
  return false;
}

/**
 * Check if user can write to a document (with hierarchy).
 * Delegates to AuthorizationService when available.
 */
export async function canWriteDocument(
  subgraph: BaseSubgraph,
  documentId: string,
  ctx: Context,
): Promise<boolean> {
  if (subgraph.authorizationService) {
    return subgraph.authorizationService.canWrite(
      documentId,
      ctx.user?.address,
      getParentIdsFn(subgraph),
    );
  }
  // Legacy fallback
  if (hasGlobalAdminAccess(ctx)) return true;
  if (subgraph.documentPermissionService) {
    return subgraph.documentPermissionService.canWrite(
      documentId,
      ctx.user?.address,
      getParentIdsFn(subgraph),
    );
  }
  return false;
}

/**
 * Throw an error if user cannot read the document
 */
export async function assertCanRead(
  subgraph: BaseSubgraph,
  documentId: string,
  ctx: Context,
): Promise<void> {
  const canRead = await canReadDocument(subgraph, documentId, ctx);
  if (!canRead) {
    throw new GraphQLError(
      "Forbidden: insufficient permissions to read this document",
    );
  }
}

/**
 * Throw an error if user cannot write to the document
 */
export async function assertCanWrite(
  subgraph: BaseSubgraph,
  documentId: string,
  ctx: Context,
): Promise<void> {
  const canWrite = await canWriteDocument(subgraph, documentId, ctx);
  if (!canWrite) {
    throw new GraphQLError(
      "Forbidden: insufficient permissions to write to this document",
    );
  }
}

/**
 * Check if user can execute a specific operation on a document.
 * Delegates to AuthorizationService.canMutate when available.
 */
export async function assertCanExecuteOperation(
  subgraph: BaseSubgraph,
  documentId: string,
  operationType: string,
  ctx: Context,
): Promise<void> {
  if (subgraph.authorizationService) {
    const canMutate = await subgraph.authorizationService.canMutate(
      documentId,
      operationType,
      ctx.user?.address,
      getParentIdsFn(subgraph),
    );
    if (!canMutate) {
      throw new GraphQLError(
        `Forbidden: insufficient permissions to execute operation "${operationType}" on this document`,
      );
    }
    return;
  }

  // Legacy fallback
  if (!subgraph.documentPermissionService) return;
  if (ctx.isAdmin?.(ctx.user?.address ?? "")) return;

  const isRestricted =
    await subgraph.documentPermissionService.isOperationRestricted(
      documentId,
      operationType,
    );

  if (isRestricted) {
    const canExecute =
      await subgraph.documentPermissionService.canExecuteOperation(
        documentId,
        operationType,
        ctx.user?.address,
      );

    if (!canExecute) {
      throw new GraphQLError(
        `Forbidden: insufficient permissions to execute operation "${operationType}" on this document`,
      );
    }
  }
}
