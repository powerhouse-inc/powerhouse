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
import { fileURLToPath } from "node:url";
import { readPackage } from "read-pkg";
import type { Logger, PluginOption, ViteDevServer } from "vite";
import { createLogger, createServer } from "vite";
import { isSubgraphClass } from "../graphql/utils.js";
import {
  BUILT_PIECE_LIST,
  PIECES_SUBPATH,
  packageRootOf,
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

export interface VitePackageLoaderOptions {
  /** Modules, as paths or file URLs, whose dependencies a package the project
   * does not install may resolve from. This loader's own module always is. */
  resolveFrom?: string[];
}

interface LoadedModule {
  id: string;
  namespace: Record<string, unknown>;
}

export class VitePackageLoader implements ISubscribablePackageLoader {
  private readonly logger = childLogger(["reactor-api", "vite-loader"]);

  private readonly vite: ViteDevServer;

  private readonly importers: string[];

  readonly name = "VitePackageLoader";

  static build(vite: ViteDevServer, options?: VitePackageLoaderOptions) {
    return new VitePackageLoader(vite, options);
  }

  constructor(vite: ViteDevServer, options: VitePackageLoaderOptions = {}) {
    this.vite = vite;
    this.importers = [...(options.resolveFrom ?? []), import.meta.url].map(
      (from) => (from.startsWith("file:") ? fileURLToPath(from) : from),
    );
  }

  // The project first, then the host's own dependencies. A bare name or a path
  // Vite cannot resolve is a package without that module, not an error.
  async #resolve(identifier: string, subpath: string) {
    const aliased = path.isAbsolute(identifier)
      ? undefined
      : this.aliasedRoot(identifier);
    const specifier = path.posix.join(aliased ?? identifier, subpath);
    const bare = !aliased && !path.isAbsolute(identifier);
    const importers = bare ? [undefined, ...this.importers] : [undefined];
    const container = this.vite.environments.ssr.pluginContainer;
    for (const importer of importers) {
      try {
        const resolved = await container.resolveId(specifier, importer);
        if (resolved && !resolved.external) return resolved.id;
      } catch (e) {
        this.logger.debug("Could not resolve @specifier: @error", specifier, e);
      }
    }
    return undefined;
  }

  // Resolved before it is loaded, so only a module that exists and fails is
  // reported; one a package does not have is a debug-level miss.
  async #load(
    identifier: string,
    subpath: string,
  ): Promise<LoadedModule | undefined> {
    const id = await this.#resolve(identifier, subpath);
    if (id === undefined) {
      this.logger.debug("No @subpath module in @pkg", subpath, identifier);
      return undefined;
    }
    try {
      const namespace = (await this.vite.ssrLoadModule(id)) as Record<
        string,
        unknown
      >;
      return { id, namespace };
    } catch (e) {
      this.logger.error(
        "Failed to load @subpath of @pkg from @id: @error",
        subpath,
        identifier,
        id,
        e instanceof Error ? e.message : e,
      );
      return undefined;
    }
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
  private pieceRoot(identifier: string, listId?: string): string | undefined {
    if (!path.isAbsolute(identifier)) {
      const aliased = this.aliasedRoot(identifier);
      if (aliased) return aliased;
      // A built list resolved from wherever the package is installed.
      if (listId) return packageRootOf(path.dirname(listId));
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
    this.logger.debug(
      "Loading document models from",
      this.getDocumentModelsPath(identifier),
    );
    const loaded = await this.#load(identifier, "document-models");
    if (!loaded) return [];

    // duck type
    const documentModels = Object.values(loaded.namespace).filter(
      (dm): dm is DocumentModelModule =>
        dm !== null && typeof dm === "object" && "documentModel" in dm,
    );
    this.logger.verbose(
      `  ➜  Loaded ${documentModels.length} Document Models from: ${identifier}`,
    );
    return documentModels;
  }

  async loadUpgradeManifests(
    identifier: string,
  ): Promise<UpgradeManifest<readonly number[]>[]> {
    // Projects generated before the aggregate index re-exported the
    // manifests only expose them at document-models/upgrade-manifests.
    for (const subpath of [
      "document-models",
      "document-models/upgrade-manifests",
    ]) {
      const loaded = await this.#load(identifier, subpath);
      if (!loaded) continue;
      const manifests = extractUpgradeManifests(loaded.namespace);
      if (manifests.length > 0) {
        this.logger.verbose(
          `  ➜  Loaded ${manifests.length} Upgrade Manifests from: ${identifier}`,
        );
        return manifests;
      }
    }
    return [];
  }

  async loadSubgraphs(identifier: string): Promise<SubgraphClass[]> {
    this.logger.verbose(
      "Loading subgraphs from",
      this.getSubgraphsPath(identifier),
    );
    const loaded = await this.#load(identifier, "subgraphs");
    if (!loaded) return [];

    const subgraphs: SubgraphClass[] = [];
    for (const [name, subgraph] of Object.entries(
      loaded.namespace as Record<string, Record<string, SubgraphClass>>,
    )) {
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
    this.logger.verbose(
      "Loading processors from",
      this.getProcessorsPath(identifier),
    );
    const loaded = await this.#load(identifier, "processors");
    const factory = loaded?.namespace.processorFactory;
    if (typeof factory === "function") {
      this.logger.verbose(`  ➜  Loaded Processor Factory from: ${identifier}`);
      return factory as ProcessorFactoryBuilder;
    }

    this.logger.verbose(`  ➜  No Processor Factory found for: ${identifier}`);
    return null;
  }

  // The list only, never a piece: in dev it is usually the TypeScript source,
  // and what it names is still the built bundle a worker will load.
  async loadPieces(identifier: string): Promise<PackagePieceEntry[]> {
    this.logger.verbose("Loading pieces from", this.getPiecesPath(identifier));
    const loaded = await this.#load(identifier, PIECES_SUBPATH);
    if (!loaded) return [];

    const root = this.pieceRoot(identifier, loaded.id);
    if (root === undefined) {
      this.logger.debug(`  ➜  No package root found for: ${identifier}`);
      return [];
    }

    const pieces = piecesFromListModule(loaded.namespace, {
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
