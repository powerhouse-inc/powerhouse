import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import type { SubgraphClass } from "@powerhousedao/reactor-api";
import type { IProcessorHostModule, ProcessorFactory } from "document-drive";
import { childLogger } from "document-drive";
import type { DocumentModelModule } from "document-model";
import path from "node:path";
import { readPackage } from "read-pkg";
import type { ViteDevServer } from "vite";
import { createServer } from "vite";
import { isSubgraphClass } from "../graphql/utils.js";
import type {
  IPackageLoaderOptions,
  ISubscribablePackageLoader,
  ISubscriptionOptions,
} from "./types.js";
import { debounce, isSubpath } from "./util.js";

export class VitePackageLoader implements ISubscribablePackageLoader {
  private readonly logger = childLogger(["reactor-api", "vite-loader"]);
  private readonly legacyReactor: boolean;

  private readonly vite: ViteDevServer;

  static build(vite: ViteDevServer, options?: IPackageLoaderOptions) {
    return new VitePackageLoader(vite, options);
  }

  constructor(vite: ViteDevServer, options?: IPackageLoaderOptions) {
    this.vite = vite;
    this.legacyReactor = options?.legacyReactor ?? false;
  }

  private getDocumentModelsPath(identifier: string): string {
    return path.join(identifier, "./document-models");
  }

  private getSubgraphsPath(identifier: string): string {
    return path.join(identifier, "./subgraphs");
  }

  private getProcessorsPath(identifier: string): string {
    return path.join(identifier, "./processors");
  }

  public loadDocumentModels(identifier: string, immediate = false) {
    return this.#loadDocumentModelsWithDebounce(immediate, identifier);
  }

  #loadDocumentModelsWithDebounce = debounce(
    this.#loadDocumentModels.bind(this),
    500,
  );

  async #loadDocumentModels(
    identifier: string,
  ): Promise<DocumentModelModule[]> {
    const fullPath = this.getDocumentModelsPath(identifier);
    this.logger.debug("Loading document models from", fullPath);

    try {
      const localDMs = (await this.vite.ssrLoadModule(fullPath)) as Record<
        string,
        DocumentModelModule
      >;

      const exports = Object.values(localDMs);

      // duck type
      const documentModels: DocumentModelModule[] = [];
      for (const dm of exports) {
        if (dm.documentModel) {
          documentModels.push(dm);
        }
      }

      this.logger.verbose(
        `  ➜  Loaded ${documentModels.length} Document Models from: ${identifier}`,
      );

      return documentModels;
    } catch (e) {
      this.logger.debug(`  ➜  No Document Models found for: ${identifier}`, e);
    }

    return [];
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    const fullPath = this.getSubgraphsPath(identifier);

    this.logger.verbose("Loading subgraphs from", fullPath);

    let localSubgraphs: Record<string, Record<string, SubgraphClass>> = {};
    try {
      localSubgraphs = await this.vite.ssrLoadModule(fullPath);
    } catch (e) {
      this.logger.debug(`  ➜  No Subgraphs found for: ${identifier}`, e);
      return [];
    }

    const subgraphs: SubgraphClass[] = [];
    for (const [name, subgraph] of Object.entries(localSubgraphs)) {
      const SubgraphClass = subgraph[name];
      if (isSubgraphClass(SubgraphClass)) {
        subgraphs.push(SubgraphClass);
      }
    }

    this.logger.debug(
      `  ➜  Loaded ${subgraphs.length} Subgraphs from: ${identifier}`,
    );

    return subgraphs;
  }

  async loadProcessors(
    identifier: string,
  ): Promise<((module: IProcessorHostModule) => ProcessorFactory) | null> {
    const fullPath = this.getProcessorsPath(identifier);

    this.logger.verbose("Loading processors from", fullPath);

    try {
      const pkgModule = await this.vite.ssrLoadModule(fullPath);

      // Choose factory based on constructor option
      const factoryName = this.legacyReactor
        ? "processorFactoryLegacy"
        : "processorFactory";
      const factory = (
        pkgModule as Record<
          string,
          ((module: IProcessorHostModule) => ProcessorFactory) | undefined
        >
      )?.[factoryName];

      if (factory && typeof factory === "function") {
        this.logger.verbose(
          `  ➜  Loaded Processor Factory (${factoryName}) from: ${identifier}`,
        );
        return factory as (module: IProcessorHostModule) => ProcessorFactory;
      }

      // Fallback: if legacy requested but not found, try default (backwards compat)
      if (
        this.legacyReactor &&
        pkgModule?.processorFactory &&
        typeof pkgModule.processorFactory === "function"
      ) {
        this.logger.verbose(
          `  ➜  Loaded Processor Factory (fallback to processorFactory) from: ${identifier}`,
        );
        return pkgModule.processorFactory as (
          module: IProcessorHostModule,
        ) => ProcessorFactory;
      }
    } catch (e) {
      this.logger.debug(
        `  ➜  No Processor Factory found for: ${identifier}`,
        e,
      );
    }

    this.logger.verbose(`  ➜  No Processor Factory found for: ${identifier}`);

    // return empty processor factory
    return null;
  }

  onDocumentModelsChange(
    identifier: string,
    handler: (documentModels: DocumentModelModule[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const listener = async (changedPath: string) => {
      const documentModelsPath = this.getDocumentModelsPath(identifier);
      if (isSubpath(documentModelsPath, changedPath)) {
        const documentModels = await this.loadDocumentModels(identifier);
        handler(documentModels);
      }
    };

    this.vite.watcher.on("change", listener);

    return () => {
      this.vite.watcher.off("change", listener);
    };
  }

  onSubgraphsChange(
    identifier: string,
    handler: (subgraphs: SubgraphClass[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const subgraphsPath = this.getSubgraphsPath(identifier);
    const listener = debounce(async (changedPath: string) => {
      if (isSubpath(subgraphsPath, changedPath)) {
        const subgraphs = await this.loadSubgraphs(identifier);
        handler(subgraphs);
      }
    }, options?.debounce ?? 100);
    this.vite.watcher.on("change", listener);

    return () => {
      this.vite.watcher.off("change", listener);
    };
  }

  onProcessorsChange(
    identifier: string,
    handler: (
      processors: ((module: IProcessorHostModule) => ProcessorFactory) | null,
    ) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const processorsPath = this.getProcessorsPath(identifier);
    const listener = async (changedPath: string) => {
      if (isSubpath(processorsPath, changedPath)) {
        const processors = await this.loadProcessors(identifier);
        handler(processors);
      }
    };
    this.vite.watcher.on("change", listener);

    return () => {
      this.vite.watcher.off("change", listener);
    };
  }
}

export async function startViteServer(root: string) {
  const packageJson = await readPackage({ cwd: root });

  const vite = await createServer({
    root,
    configFile: false,
    server: { middlewareMode: true, watch: { ignored: ["**/.ph/**"] } },
    appType: "custom",
    build: {
      rollupOptions: {
        input: [],
      },
    },
    resolve: {
      alias: {
        [packageJson.name]: root,
      },
    },
    plugins: [
      viteCommonjs(),
      {
        name: "suppress-hmr",
        handleHotUpdate() {
          return []; // return empty array to suppress server refresh
        },
      },
    ],
  });

  return vite;
}
