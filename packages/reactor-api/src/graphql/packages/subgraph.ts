import { ConsoleLogger, ph } from "document-model";
import type { PackageManagementService } from "../../services/package-management.service.js";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SchemaBuilder } from "../subgraph-schema.js";
import type { SubgraphArgs } from "../types.js";
import * as resolvers from "./resolvers.js";

const InstalledPackage = ph.object("InstalledPackage", {
  fields: {
    name: ph.String({ required: true }),
    version: ph.String(),
    registryUrl: ph.String({ required: true }),
    installedAt: ph.DateTime({ required: true }),
    documentTypes: ph.list(ph.String({ required: true }), { required: true }),
  },
});

const InstallPackageResult = ph.object("InstallPackageResult", {
  fields: {
    package: ph.ref(InstalledPackage, { required: true }),
    documentModelsLoaded: ph.Int({ required: true }),
  },
});

const PackagesQueries = ph.object("PackagesQueries", {
  fields: {
    installedPackages: ph.field({
      returns: ph.list(ph.ref(InstalledPackage, { required: true }), {
        required: true,
      }),
    }),
    installedPackage: ph.field({
      args: { name: ph.String({ required: true }) },
      returns: ph.ref(InstalledPackage),
    }),
  },
});

const PackagesMutations = ph.object("PackagesMutations", {
  fields: {
    installPackage: ph.field({
      args: {
        name: ph.String({ required: true }),
        registryUrl: ph.String(),
      },
      returns: ph.ref(InstallPackageResult, { required: true }),
    }),
    uninstallPackage: ph.field({
      args: { name: ph.String({ required: true }) },
      returns: ph.Boolean({ required: true }),
    }),
  },
});

export interface PackagesSubgraphArgs extends SubgraphArgs {
  packageManagementService: PackageManagementService;
}

export class PackagesSubgraph extends BaseSubgraph {
  private logger = new ConsoleLogger(["PackagesSubgraph"]);
  private packageManagementService: PackageManagementService;

  constructor(args: PackagesSubgraphArgs) {
    super(args);
    this.packageManagementService = args.packageManagementService;
    this.logger.verbose(`constructor()`);
  }

  static override readonly subgraphName = "packages" as const;

  static override getSchema(schema: SchemaBuilder<PackagesSubgraph>) {
    return [
      schema.query("Packages", {
        returns: ph.ref(PackagesQueries, { required: true }),
        resolve: () => ({}),
      }),
      schema.field(PackagesQueries.computedTokens.installedPackages, {
        resolve: async ({ subgraph }) => {
          subgraph.logger.debug("installedPackages");
          try {
            return await resolvers.installedPackages(
              subgraph.packageManagementService,
            );
          } catch (error) {
            subgraph.logger.error("Error in installedPackages: @error", error);
            throw error;
          }
        },
      }),
      schema.field(PackagesQueries.computedTokens.installedPackage, {
        resolve: async ({ subgraph, args }) => {
          subgraph.logger.debug("installedPackage(@args)", args);
          try {
            return await resolvers.installedPackage(
              subgraph.packageManagementService,
              args,
            );
          } catch (error) {
            subgraph.logger.error("Error in installedPackage: @error", error);
            throw error;
          }
        },
      }),
      schema.mutation("Packages", {
        returns: ph.ref(PackagesMutations, { required: true }),
        resolve: () => ({}),
      }),
      schema.field(PackagesMutations.computedTokens.installPackage, {
        resolve: async ({ subgraph, args, request }) => {
          subgraph.logger.debug("installPackage(@args)", args);
          try {
            return await resolvers.installPackage(
              subgraph.packageManagementService,
              subgraph.authorizationService,
              args,
              request,
            );
          } catch (error) {
            subgraph.logger.error("Error in installPackage: @error", error);
            throw error;
          }
        },
      }),
      schema.field(PackagesMutations.computedTokens.uninstallPackage, {
        resolve: async ({ subgraph, args, request }) => {
          subgraph.logger.debug("uninstallPackage(@args)", args);
          try {
            return await resolvers.uninstallPackage(
              subgraph.packageManagementService,
              subgraph.authorizationService,
              args,
              request,
            );
          } catch (error) {
            subgraph.logger.error("Error in uninstallPackage: @error", error);
            throw error;
          }
        },
      }),
    ];
  }

  override onSetup(): Promise<void> {
    this.logger.debug("Setting up PackagesSubgraph");
    return Promise.resolve();
  }
}
