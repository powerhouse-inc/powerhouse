/**
 * Package Management Resolvers
 *
 * Resolver functions for the packages subgraph.
 */

import { GraphQLError } from "graphql";
import type { PackageManagementService } from "../../services/package-management.service.js";
import type { InstalledPackageInfo } from "../../services/package-storage.js";

/**
 * Context type for package resolvers
 */
export interface PackageResolverContext {
  user?: { address: string };
  isAdmin?: (address: string) => boolean;
}

/**
 * Check if the current user has admin access.
 * When auth is disabled, isAdmin returns true for any address.
 */
function requireAdmin(ctx: PackageResolverContext): void {
  const isAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
  if (!isAdmin) {
    throw new GraphQLError("Admin access required");
  }
}

/**
 * Convert InstalledPackageInfo to GraphQL type format
 */
function formatPackageInfo(info: InstalledPackageInfo) {
  return {
    name: info.name,
    version: info.version ?? null,
    registryUrl: info.registryUrl,
    installedAt: info.installedAt.toISOString(),
    documentTypes: info.documentTypes,
  };
}

/**
 * Query: Get all installed packages
 */
export async function installedPackages(
  service: PackageManagementService,
): Promise<ReturnType<typeof formatPackageInfo>[]> {
  const packages = await service.getInstalledPackages();
  return packages.map(formatPackageInfo);
}

/**
 * Query: Get a specific installed package by name
 */
export async function installedPackage(
  service: PackageManagementService,
  args: { name: string },
): Promise<ReturnType<typeof formatPackageInfo> | null> {
  const pkg = await service.getInstalledPackage(args.name);
  return pkg ? formatPackageInfo(pkg) : null;
}

/**
 * Mutation: Install a package from the registry
 */
export async function installPackage(
  service: PackageManagementService,
  args: { name: string; registryUrl?: string | null },
  ctx: PackageResolverContext,
): Promise<{
  package: ReturnType<typeof formatPackageInfo>;
  documentModelsLoaded: number;
}> {
  requireAdmin(ctx);

  const result = await service.installPackage(
    args.name,
    args.registryUrl ?? undefined,
  );

  return {
    package: formatPackageInfo(result.package),
    documentModelsLoaded: result.documentModelsLoaded,
  };
}

/**
 * Mutation: Uninstall a package
 */
export async function uninstallPackage(
  service: PackageManagementService,
  args: { name: string },
  ctx: PackageResolverContext,
): Promise<boolean> {
  requireAdmin(ctx);

  return service.uninstallPackage(args.name);
}
