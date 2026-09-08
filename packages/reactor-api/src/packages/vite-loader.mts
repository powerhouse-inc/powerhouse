import { viteCommonjs } from "@originjs/vite-plugin-commonjs";
import type {
  ProcessorFactoryBuilder,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { childLogger, type ILogger } from "document-model";
import path from "node:path";
import { readPackage } from "read-pkg";
import type { Logger, PluginOption, ViteDevServer } from "vite";
import { createLogger, createServer } from "vite";
import { isSubgraphClass } from "../graphql/utils.js";
import type {
  ISubscribablePackageLoader,
  ISubscriptionOptions,
} from "./types.js";
import { debounce, extractUpgradeManifests, isSubpath } from "./util.js";

/** True only when Vite could not load the exact top-level module requested. */
function isMissingViteModule(error: unknown, requestedPath: string): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  if (String(error.code) !== "ERR_LOAD_URL") return false;

  const prefix = `Failed to load url ${requestedPath} (resolved id: `;
  return (
    error.message.startsWith(prefix) &&
    error.message.endsWith("). Does the file exist?")
  );
}

export function createViteLogger(logger: ILogger, prefix = "") {
  const customLogger = createLogger("info", {
    prefix,
  });
  customLogger.info = logger.info;
  customLogger.warn = logger.warn;
  customLogger.error = logger.error;
  return customLogger;
}

export class VitePackageLoader implements ISubscribablePackageLoader {
  private readonly logger = childLogger(["reactor-api", "vite-loader"]);

  private readonly vite: ViteDevServer;

  readonly name = "VitePackageLoader";

  static build(vite: ViteDevServer) {
    return new VitePackageLoader(vite);
  }

  constructor(vite: ViteDevServer) {
    this.vite = vite;
  }

  private getDocumentModelsPath(identifier: string): string {
    return path.posix.join(identifier, "./document-models");
  }

  private getSubgraphsPath(identifier: string): string {
    return path.posix.join(identifier, "./subgraphs");
  }

  private getProcessorsPath(identifier: string): string {
    return path.posix.join(identifier, "./processors");
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

      const documentModels: DocumentModelModule[] = [];
      for (const dm of Object.values(localDMs)) {
        if (dm.documentModel) documentModels.push(dm);
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

  async loadUpgradeManifests(
    identifier: string,
  ): Promise<UpgradeManifest<readonly number[]>[]> {
    // Projects generated before the aggregate index re-exported the
    // manifests only expose them at document-models/upgrade-manifests, so
    // try both without requiring a regeneration.
    const candidatePaths = [
      this.getDocumentModelsPath(identifier),
      path.posix.join(
        this.getDocumentModelsPath(identifier),
        "upgrade-manifests",
      ),
    ];
    for (const fullPath of candidatePaths) {
      try {
        const namespace = (await this.vite.ssrLoadModule(fullPath)) as Record<
          string,
          unknown
        >;
        const manifests = extractUpgradeManifests(namespace);
        if (manifests.length > 0) {
          this.logger.verbose(
            `  ➜  Loaded ${manifests.length} Upgrade Manifests from: ${identifier}`,
          );
          return manifests;
        }
      } catch (error) {
        if (!isMissingViteModule(error, fullPath)) throw error;
        this.logger.debug(
          `  ➜  No Upgrade Manifests found at ${fullPath} for: ${identifier}`,
          error,
        );
      }
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
  ): Promise<ProcessorFactoryBuilder | null> {
    const fullPath = this.getProcessorsPath(identifier);

    this.logger.verbose("Loading processors from", fullPath);

    try {
      const pkgModule = await this.vite.ssrLoadModule(fullPath);

      const factory = (
        pkgModule as Record<string, ProcessorFactoryBuilder | undefined>
      )?.processorFactory;

      if (factory && typeof factory === "function") {
        this.logger.verbose(
          `  ➜  Loaded Processor Factory from: ${identifier}`,
        );
        return factory;
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
    const debouncedListener = debounce(async (changedPath: string) => {
      if (isSubpath(subgraphsPath, changedPath)) {
        const subgraphs = await this.loadSubgraphs(identifier);
        handler(subgraphs);
      }
    }, options?.debounce ?? 100);
    const listener = (changedPath: string) => {
      void debouncedListener(false, changedPath);
    };
    this.vite.watcher.on("change", listener);

    return () => {
      this.vite.watcher.off("change", listener);
    };
  }

  onProcessorsChange(
    identifier: string,
    handler: (processors: ProcessorFactoryBuilder | null) => void,
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

export async function startViteServer(root: string, logger?: Logger) {
  const packageJson = await readPackage({ cwd: root });

  const vite = await createServer({
    root,
    configFile: false,
    logger,
    server: { middlewareMode: true, watch: { ignored: ["**/.ph/**"] } },
    appType: "custom",
    build: {
      rollupOptions: {
        input: [],
      },
    },
    resolve: {
      tsconfigPaths: true,
      alias: {
        [packageJson.name]: root,
      },
    },
    plugins: [
      // cast: the plugin ships types built against an older vite, and the
      // mismatched Plugin type crashes tsc 6 during assignability checking
      viteCommonjs() as PluginOption,
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
