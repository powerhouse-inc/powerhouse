import { ConsoleLogger } from "document-model";
import type { PackageManagementService } from "../../../src/services/package-management.service.js";
import { BaseSubgraph } from "../../../src/graphql/base-subgraph.js";
import type { SchemaBuilder } from "../../../src/graphql/subgraph-schema.js";
import type { Context, SubgraphArgs } from "../../../src/graphql/types.js";
import * as resolvers from "../../../src/graphql/packages/resolvers.js";
import { packagesSchema } from "./packages-schema.js";

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

  static override readonly subgraphName = packagesSchema.subgraphName;

  static override getSchema(schema: SchemaBuilder<PackagesSubgraph>) {
    return schema.graphql({
      typeDefs: packagesSchema.typeDefs,
      resolverCoordinates: packagesSchema.resolverCoordinates,
      resolvers: (subgraph) => subgraph.#resolvers(),
    });
  }

  #resolvers() {
    return {
      Query: {
        Packages: () => ({}),
      },
      PackagesQueries: {
        installedPackages: async () => {
          this.logger.debug("installedPackages");
          try {
            return await resolvers.installedPackages(
              this.packageManagementService,
            );
          } catch (error) {
            this.logger.error("Error in installedPackages: @error", error);
            throw error;
          }
        },

        installedPackage: async (_parent: unknown, args: { name: string }) => {
          this.logger.debug("installedPackage(@args)", args);
          try {
            return await resolvers.installedPackage(
              this.packageManagementService,
              args,
            );
          } catch (error) {
            this.logger.error("Error in installedPackage: @error", error);
            throw error;
          }
        },
      },

      Mutation: {
        Packages: () => ({}),
      },

      PackagesMutations: {
        installPackage: async (
          _parent: unknown,
          args: { name: string; registryUrl?: string | null },
          ctx: Context,
        ) => {
          this.logger.debug("installPackage(@args)", args);
          try {
            return await resolvers.installPackage(
              this.packageManagementService,
              this.authorizationService,
              args,
              ctx,
            );
          } catch (error) {
            this.logger.error("Error in installPackage: @error", error);
            throw error;
          }
        },

        uninstallPackage: async (
          _parent: unknown,
          args: { name: string },
          ctx: Context,
        ) => {
          this.logger.debug("uninstallPackage(@args)", args);
          try {
            return await resolvers.uninstallPackage(
              this.packageManagementService,
              this.authorizationService,
              args,
              ctx,
            );
          } catch (error) {
            this.logger.error("Error in uninstallPackage: @error", error);
            throw error;
          }
        },
      },
    };
  }

  override onSetup(): Promise<void> {
    this.logger.debug("Setting up PackagesSubgraph");
    return Promise.resolve();
  }
}
