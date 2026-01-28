import type { BaseSubgraph, Context } from "@powerhousedao/reactor-api";
import { GraphQLError } from "graphql";

/**
 * Check if user has global read access (admin, user, or guest)
 */
export function hasGlobalReadAccess(ctx: Context): boolean {
  const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
  const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
  const isGlobalGuest =
    ctx.isGuest?.(ctx.user?.address ?? "") || process.env.FREE_ENTRY === "true";
  return !!(isGlobalAdmin || isGlobalUser || isGlobalGuest);
}

/**
 * Check if user has global write access (admin or user, not guest)
 */
export function hasGlobalWriteAccess(ctx: Context): boolean {
  const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
  const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
  return !!(isGlobalAdmin || isGlobalUser);
}

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
 * Check if user can read a document (with hierarchy)
 */
export async function canReadDocument(
  subgraph: BaseSubgraph,
  documentId: string,
  ctx: Context,
): Promise<boolean> {
  // Global access allows reading
  if (hasGlobalReadAccess(ctx)) {
    return true;
  }

  // Check document-level permissions with hierarchy
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
 * Check if user can write to a document (with hierarchy)
 */
export async function canWriteDocument(
  subgraph: BaseSubgraph,
  documentId: string,
  ctx: Context,
): Promise<boolean> {
  // Global write access allows writing
  if (hasGlobalWriteAccess(ctx)) {
    return true;
  }

  // Check document-level permissions with hierarchy
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
 * Throws an error if the operation is restricted and user lacks permission.
 */
export async function assertCanExecuteOperation(
  subgraph: BaseSubgraph,
  documentId: string,
  operationType: string,
  ctx: Context,
): Promise<void> {
  // Skip if no permission service
  if (!subgraph.documentPermissionService) {
    return;
  }

  // Global admins bypass operation-level restrictions
  if (ctx.isAdmin?.(ctx.user?.address ?? "")) {
    return;
  }

  // Check if this operation has any restrictions set
  const isRestricted =
    await subgraph.documentPermissionService.isOperationRestricted(
      documentId,
      operationType,
    );

  if (isRestricted) {
    // Operation is restricted, check if user has permission
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
