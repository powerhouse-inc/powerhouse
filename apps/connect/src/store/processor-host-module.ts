import type { ReactorClientModule } from "@powerhousedao/reactor";
import {
  createOrGetAnalyticsStore,
  type IPackageManager,
  type VetraPackage,
} from "@powerhousedao/reactor-browser";
import { childLogger } from "document-model/core";
import {
  DEFAULT_ANALYTICS_PROCESSOR_DB_NAME,
  type IProcessorHostModule,
} from "shared/processors";
import { getDb } from "../pglite.db.js";

const logger = childLogger(["connect", "processor-host-module"]);

export interface IProcessorsManager {
  init(): Promise<void>;
}

export class ProcessorsManager implements IProcessorsManager {
  #reactorClient: ReactorClientModule;
  #processorHostModule: IProcessorHostModule;
  #packageManager: IPackageManager;
  #subscribedPackages: VetraPackage[] = [];

  constructor(
    reactorClientModule: ReactorClientModule,
    processorHostModule: IProcessorHostModule,
    packageManager: IPackageManager,
  ) {
    this.#reactorClient = reactorClientModule;
    this.#processorHostModule = processorHostModule;
    this.#packageManager = packageManager;
  }

  async init() {
    await this.#setupPackageFactories(this.#packageManager.packages);
    this.#packageManager.subscribe(({ packages }) => {
      this.#setupPackageFactories(packages).catch((error) => {
        logger.error("Error setting up package factories", error);
      });
    });
  }

  async #setupPackageFactories(packages: VetraPackage[]) {
    for (const pkg of packages) {
      const success = await this.#setupProcessorsFactory(pkg);
      if (success) {
        this.#subscribedPackages.push(pkg);
      }
    }
  }

  async #setupProcessorsFactory(pkg: VetraPackage): Promise<boolean> {
    const { id, name, processorFactory } = pkg;
    if (!processorFactory) {
      return false;
    }
    logger.debug("Loading processor factory: @name", name);
    try {
      const factory = await processorFactory(this.#processorHostModule);
      await this.#reactorClient.reactorModule?.processorManager.registerFactory(
        id,
        factory,
      );
      return true;
    } catch (error) {
      logger.error(`Error registering processor: @name`, name);
      logger.error("@error", error);
      return false;
    }
  }
}

export async function createProcessorHostModule(): Promise<
  IProcessorHostModule | undefined
> {
  try {
    const relationalDb = await getDb();
    const analyticsStore = await createOrGetAnalyticsStore({
      databaseName: DEFAULT_ANALYTICS_PROCESSOR_DB_NAME,
    });
    const processorApp = "connect" as const;
    return {
      relationalDb,
      analyticsStore,
      processorApp,
    };
  } catch (error) {
    logger.error(`Failed to initialize processor host module: @error`, error);
  }
}
