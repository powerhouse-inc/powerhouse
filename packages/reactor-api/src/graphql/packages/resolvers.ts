import { GraphQLError } from "graphql";
import type { PackageManagementService } from "../../services/package-management.service.js";
import type { InstalledPackageInfo } from "../../services/package-storage.js";
import type { Context } from "../types.js";

function requireAdmin(ctx: Context): void {
  const isAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
  if (!isAdmin) {
    throw new GraphQLError("Admin access required");
  }
}

function formatPackageInfo(info: InstalledPackageInfo) {
  return {
    name: info.name,
    version: info.version ?? null,
    registryUrl: info.registryUrl,
    installedAt: info.installedAt.toISOString(),
    documentTypes: info.documentTypes,
  };
}

export async function installedPackages(
  service: PackageManagementService,
): Promise<ReturnType<typeof formatPackageInfo>[]> {
  const packages = await service.getInstalledPackages();
  return packages.map(formatPackageInfo);
}

export async function installedPackage(
  service: PackageManagementService,
  args: { name: string },
): Promise<ReturnType<typeof formatPackageInfo> | null> {
  const pkg = await service.getInstalledPackage(args.name);
  return pkg ? formatPackageInfo(pkg) : null;
}

export async function installPackage(
  service: PackageManagementService,
  args: { name: string; registryUrl?: string | null },
  ctx: Context,
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

export async function uninstallPackage(
  service: PackageManagementService,
  args: { name: string },
  ctx: Context,
): Promise<boolean> {
  requireAdmin(ctx);

  return service.uninstallPackage(args.name);
}
