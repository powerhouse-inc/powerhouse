import { ConsoleLogger } from "document-model";
import fs from "fs";
import { gql } from "graphql-tag";
import path from "path";
import { fileURLToPath } from "url";
import type { PackageManagementService } from "../../services/package-management.service.js";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
import type { PackageResolverContext } from "./resolvers.js";
import * as resolvers from "./resolvers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  name = "packages";
  hasSubscriptions = false;

  // Load schema from file
  typeDefs = gql(
    fs.readFileSync(path.join(__dirname, "schema.graphql"), "utf-8"),
  );

  resolvers = {
    Query: {
      installedPackages: async () => {
        this.logger.debug("installedPackages");
        try {
          return await resolvers.installedPackages(
            this.packageManagementService,
          );
        } catch (error) {
          this.logger.error("Error in installedPackages:", error);
          throw error;
        }
      },

      installedPackage: async (_parent: unknown, args: { name: string }) => {
        this.logger.debug("installedPackage", args);
        try {
          return await resolvers.installedPackage(
            this.packageManagementService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in installedPackage:", error);
          throw error;
        }
      },
    },

    Mutation: {
      installPackage: async (
        _parent: unknown,
        args: { name: string; registryUrl?: string | null },
        ctx: PackageResolverContext,
      ) => {
        this.logger.debug("installPackage", args);
        try {
          return await resolvers.installPackage(
            this.packageManagementService,
            args,
            ctx,
          );
        } catch (error) {
          this.logger.error("Error in installPackage:", error);
          throw error;
        }
      },

      uninstallPackage: async (
        _parent: unknown,
        args: { name: string },
        ctx: PackageResolverContext,
      ) => {
        this.logger.debug("uninstallPackage", args);
        try {
          return await resolvers.uninstallPackage(
            this.packageManagementService,
            args,
            ctx,
          );
        } catch (error) {
          this.logger.error("Error in uninstallPackage:", error);
          throw error;
        }
      },
    },
  };

  onSetup(): Promise<void> {
    this.logger.debug("Setting up PackagesSubgraph");
    return Promise.resolve();
  }
}
