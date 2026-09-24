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
import {
  BUILT_PIECE_LIST,
  PIECES_SUBPATH,
  pieceListLocation,
  piecesFromListModule,
} from "./pieces.js";
import type {
  ISubscribablePackageLoader,
  ISubscriptionOptions,
  PackagePieceEntry,
} from "./types.js";
import { debounce, extractUpgradeManifests, isSubpath } from "./util.js";

export function createViteLogger(logger: ILogger, prefix = "") {
  const customLogger = createLogger("info", {
    prefix,
  });
  // Wrapped rather than assigned: the logger methods are bound to their own
  // instance, and re-homing them onto Vite's logger object made every Vite
  // log line throw.
  //
  // Vite's text goes through as a replacement, never as the format string: it
  // is somebody else's prose, not a template. `ILogger` substitutes `@token`,
  // and Vite log lines are full of npm scopes, so `pre-transforming
  // @powerhousedao/design-system` came out as `pre-transforming
  // null/design-system`. Substituting into `@line` instead emits it verbatim.
  //
  // Vite's second argument is dropped for the same reason. It is `LogOptions`
  // -- `{ clear, timestamp }` -- and forwarding it made it the replacement for
  // whatever `@token` the line happened to contain, or got appended as JSON.
  // Only `error` keeps it, where it carries the error itself.
  customLogger.info = (msg) => logger.info("@line", msg);
  customLogger.warn = (msg) => logger.warn("@line", msg);
  customLogger.error = (msg, options) =>
    options?.error
      ? logger.error("@line", msg, options.error)
      : logger.error("@line", msg);
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

  private getPiecesPath(identifier: string): string {
    return path.posix.join(identifier, `./${PIECES_SUBPATH}`);
  }

  // The dev server aliases the local project by its own package name, so a
  // package that is this project is rooted at the source tree vite serves.
  private aliasedRoot(identifier: string): string | undefined {
    const alias = this.vite.config.resolve.alias;
    const entries = Array.isArray(alias) ? alias : [];
    const hit = entries.find((entry) => entry.find === identifier);
    return typeof hit?.replacement === "string" ? hit.replacement : undefined;
  }

  // What a declared piece path is relative to. Not the module vite loaded: a
  // list read from source still points at the built output beside it.
  private pieceRoot(identifier: string): string | undefined {
    if (!path.isAbsolute(identifier)) {
      const aliased = this.aliasedRoot(identifier);
      if (aliased) return aliased;
    }
    try {
      return pieceListLocation(identifier).root;
    } catch {
      return undefined;
    }
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
      } catch (e) {
        this.logger.debug(
          `  ➜  No Upgrade Manifests found at ${fullPath} for: ${identifier}`,
          e,
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

  // The list only, never a piece: in dev it is usually the TypeScript source,
  // and what it names is still the built bundle a worker will load.
  async loadPieces(identifier: string): Promise<PackagePieceEntry[]> {
    const root = this.pieceRoot(identifier);
    if (root === undefined) {
      this.logger.debug(`  ➜  No package root found for: ${identifier}`);
      return [];
    }

    const fullPath = this.getPiecesPath(identifier);
    this.logger.verbose("Loading pieces from", fullPath);

    let module: unknown;
    try {
      module = await this.vite.ssrLoadModule(fullPath);
    } catch (e) {
      this.logger.debug(`  ➜  No pieces found for: ${identifier}`, e);
      return [];
    }

    const pieces = piecesFromListModule(module, {
      root,
      identifier,
      logger: this.logger,
    });
    this.logger.debug(
      `  ➜  Loaded ${pieces.length} Pieces from: ${identifier}`,
    );
    return pieces;
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

    // "change" alone misses files that are created or deleted: a removed
    // document-models/ entry would never report an empty result, and the
    // package's registered models would leak.
    this.vite.watcher.on("change", listener);
    this.vite.watcher.on("add", listener);
    this.vite.watcher.on("unlink", listener);

    return () => {
      this.vite.watcher.off("change", listener);
      this.vite.watcher.off("add", listener);
      this.vite.watcher.off("unlink", listener);
    };
  }

  onSubgraphsChange(
    identifier: string,
    handler: (subgraphs: SubgraphClass[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const subgraphsPath = this.getSubgraphsPath(identifier);
    const listener = async (changedPath: string) => {
      if (isSubpath(subgraphsPath, changedPath)) {
        const subgraphs = await this.loadSubgraphs(identifier);
        handler(subgraphs);
      }
    };
    // "change" alone misses files that are created or deleted: a removed
    // subgraphs/ entry would never report an empty result, and the
    // package's registered subgraphs would leak.
    this.vite.watcher.on("change", listener);
    this.vite.watcher.on("add", listener);
    this.vite.watcher.on("unlink", listener);

    return () => {
      this.vite.watcher.off("change", listener);
      this.vite.watcher.off("add", listener);
      this.vite.watcher.off("unlink", listener);
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
    // "change" alone misses files that are created or deleted: a removed
    // processors/ entry would never report an empty result, and the
    // package's registered processor factories would leak.
    this.vite.watcher.on("change", listener);
    this.vite.watcher.on("add", listener);
    this.vite.watcher.on("unlink", listener);

    return () => {
      this.vite.watcher.off("change", listener);
      this.vite.watcher.off("add", listener);
      this.vite.watcher.off("unlink", listener);
    };
  }

  onPiecesChange(
    identifier: string,
    handler: (pieces: PackagePieceEntry[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    // Both the source list and the build output: the list says which pieces a
    // package ships, and only the build decides whether one is there to run.
    const watched = [this.getPiecesPath(identifier)];
    const root = this.pieceRoot(identifier);
    if (root !== undefined) {
      watched.push(path.dirname(path.resolve(root, BUILT_PIECE_LIST)));
    }
    const listener = async (changedPath: string) => {
      if (!watched.some((dir) => isSubpath(dir, changedPath))) return;
      handler(await this.loadPieces(identifier));
    };
    // "change" alone misses files that are created or deleted, and a piece
    // appearing for the first time is exactly the build this watches for.
    this.vite.watcher.on("change", listener);
    this.vite.watcher.on("add", listener);
    this.vite.watcher.on("unlink", listener);

    return () => {
      this.vite.watcher.off("change", listener);
      this.vite.watcher.off("add", listener);
      this.vite.watcher.off("unlink", listener);
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
