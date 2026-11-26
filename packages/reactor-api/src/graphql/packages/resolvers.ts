import { logAdministration } from "@powerhousedao/shared/processors";
import { childLogger } from "document-model";
import { GraphQLError } from "graphql";
import type { IAuthorizationService } from "../../services/authorization.service.js";
import type { PackageManagementService } from "../../services/package-management.service.js";
import type { InstalledPackageInfo } from "../../services/package-storage.js";
import type { Context } from "../types.js";

const logger = childLogger(["reactor-api", "administration"]);

/** Package installs are instance administration: an operator's, whatever the policy. */
function requireAdmin(
  authorizationService: IAuthorizationService,
  ctx: Context,
): void {
  if (!authorizationService.isOperator(ctx.user?.address)) {
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
  authorizationService: IAuthorizationService,
  args: { name: string; registryUrl?: string | null },
  ctx: Context,
): Promise<{
  package: ReturnType<typeof formatPackageInfo>;
  documentModelsLoaded: number;
}> {
  requireAdmin(authorizationService, ctx);

  const result = await service.installPackage(
    args.name,
    args.registryUrl ?? undefined,
  );
  logAdministration(
    logger,
    `installed package ${args.name}${args.registryUrl ? ` from ${args.registryUrl}` : ""}`,
    ctx.user,
  );

  return {
    package: formatPackageInfo(result.package),
    documentModelsLoaded: result.documentModelsLoaded,
  };
}

export async function uninstallPackage(
  service: PackageManagementService,
  authorizationService: IAuthorizationService,
  args: { name: string },
  ctx: Context,
): Promise<boolean> {
  requireAdmin(authorizationService, ctx);

  const removed = await service.uninstallPackage(args.name);
  if (removed) {
    logAdministration(logger, `uninstalled package ${args.name}`, ctx.user);
  }
  return removed;
}
