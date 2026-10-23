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
import { extractDocumentModels } from "./document-model-detection.js";
import { type ScalarExport, scalarExportsOf } from "./scalar-exports.js";
import { extractSubgraphs } from "./subgraph-extraction.js";
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
import {
  PACKAGE_MODULE_FAILED,
  debounce,
  extractUpgradeManifests,
  failedLoadHeader,
  isSubpath,
} from "./util.js";
import { runDetached, type ReportError } from "../utils/detached.js";

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
  reportError?: ReportError;
}

interface LoadedModule {
  id: string;
  namespace: Record<string, unknown>;
}

export class VitePackageLoader implements ISubscribablePackageLoader {
  private readonly logger = childLogger(["reactor-api", "vite-loader"]);

  private readonly vite: ViteDevServer;

  private readonly importers: string[];

  readonly #reportError?: ReportError;

  readonly name = "VitePackageLoader";

  static build(vite: ViteDevServer, options?: VitePackageLoaderOptions) {
    return new VitePackageLoader(vite, options);
  }

  constructor(vite: ViteDevServer, options: VitePackageLoaderOptions = {}) {
    this.vite = vite;
    this.importers = [...(options.resolveFrom ?? []), import.meta.url].map(
      (from) => (from.startsWith("file:") ? fileURLToPath(from) : from),
    );
    this.#reportError = options.reportError;
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
  // reported and thrown; one a package does not have is a debug-level miss.
  async #load(
    identifier: string,
    subpath: string,
    kind: string,
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
      const message = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `${failedLoadHeader(kind)}\n  @id: @error`,
        identifier,
        id,
        message,
      );
      // Tagged: vite's own code can read as a package without the module.
      throw Object.assign(
        new Error(`Failed to load ${id}: ${message}`, { cause: e }),
        { code: PACKAGE_MODULE_FAILED },
      );
    }
  }

  private getDocumentModelsPath(identifier: string): string {
    return path.posix.join(identifier, "./document-models");
  }

  private getSubgraphsPath(identifier: string): string {
    return path.posix.join(identifier, "./subgraphs");
  }

  private getScalarsPath(identifier: string): string {
    return path.posix.join(identifier, "./scalars");
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

  async loadDocumentModels(identifier: string): Promise<DocumentModelModule[]> {
    this.logger.debug(
      "Loading document models from",
      this.getDocumentModelsPath(identifier),
    );
    const loaded = await this.#load(
      identifier,
      "document-models",
      "document models",
    );
    if (!loaded) return [];

    const documentModels = extractDocumentModels(loaded.namespace);
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
      const loaded = await this.#load(identifier, subpath, "upgrade manifests");
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
    const loaded = await this.#load(identifier, "subgraphs", "subgraphs");
    if (!loaded) return [];

    const subgraphs = extractSubgraphs(loaded.namespace);

    this.logger.debug(
      `  ➜  Loaded ${subgraphs.length} Subgraphs from: ${identifier}`,
    );

    return subgraphs;
  }

  async loadScalars(identifier: string): Promise<ScalarExport[]> {
    this.logger.verbose(
      "Loading scalars from",
      this.getScalarsPath(identifier),
    );
    const loaded = await this.#load(identifier, "scalars", "scalars");
    if (!loaded) return [];
    const scalars = scalarExportsOf(loaded.namespace);
    this.logger.debug(
      `  ➜  Loaded ${scalars.length} Scalars from: ${identifier}`,
    );
    return scalars;
  }

  async loadProcessors(
    identifier: string,
  ): Promise<ProcessorFactoryBuilder | null> {
    this.logger.verbose(
      "Loading processors from",
      this.getProcessorsPath(identifier),
    );
    const loaded = await this.#load(identifier, "processors", "processors");
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
    const loaded = await this.#load(identifier, PIECES_SUBPATH, "pieces");
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

  // One detached reload per burst of file events. "add" and "unlink" too, or a
  // removed entry never reports empty and its registrations leak. Once
  // unsubscribed, no pending or running reload reaches `handler`, and a
  // failed load leaves the last good set.
  #watch<T>(
    label: string,
    matches: (changedPath: string) => unknown,
    load: () => Promise<T>,
    handler: (value: T) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    let subscribed = true;
    const reloadOnce = debounce(
      () =>
        runDetached(
          label,
          async () => {
            if (!subscribed) return;
            let value: T;
            try {
              value = await load();
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code === PACKAGE_MODULE_FAILED) {
                return;
              }
              throw e;
            }
            if (subscribed) handler(value);
          },
          { logger: this.logger, report: this.#reportError },
        ),
      options?.debounce ?? 100,
    );
    const listener = (changedPath: string) => {
      if (matches(changedPath)) void reloadOnce();
    };
    const events = ["change", "add", "unlink"] as const;
    for (const event of events) this.vite.watcher.on(event, listener);

    return () => {
      subscribed = false;
      for (const event of events) this.vite.watcher.off(event, listener);
    };
  }

  onDocumentModelsChange(
    identifier: string,
    handler: (documentModels: DocumentModelModule[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const watched = [
      this.getDocumentModelsPath(identifier),
      this.getScalarsPath(identifier),
    ];
    return this.#watch(
      `Reloading the document models of ${identifier}`,
      (changedPath) => watched.some((dir) => isSubpath(dir, changedPath)),
      () => this.loadDocumentModels(identifier),
      handler,
      options,
    );
  }

  onSubgraphsChange(
    identifier: string,
    handler: (subgraphs: SubgraphClass[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const subgraphsPath = this.getSubgraphsPath(identifier);
    return this.#watch(
      `Reloading the subgraphs of ${identifier}`,
      (changedPath) => isSubpath(subgraphsPath, changedPath),
      () => this.loadSubgraphs(identifier),
      handler,
      options,
    );
  }

  onScalarsChange(
    identifier: string,
    handler: (scalars: ScalarExport[]) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const scalarsPath = this.getScalarsPath(identifier);
    return this.#watch(
      `Reloading the scalars of ${identifier}`,
      (changedPath) => isSubpath(scalarsPath, changedPath),
      () => this.loadScalars(identifier),
      handler,
      options,
    );
  }

  onProcessorsChange(
    identifier: string,
    handler: (processors: ProcessorFactoryBuilder | null) => void,
    options?: ISubscriptionOptions,
  ): () => void {
    const processorsPath = this.getProcessorsPath(identifier);
    return this.#watch(
      `Reloading the processors of ${identifier}`,
      (changedPath) => isSubpath(processorsPath, changedPath),
      () => this.loadProcessors(identifier),
      handler,
      options,
    );
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
    return this.#watch(
      `Reloading the pieces of ${identifier}`,
      (changedPath) => watched.some((dir) => isSubpath(dir, changedPath)),
      () => this.loadPieces(identifier),
      handler,
      options,
    );
  }
}

export async function startViteServer(root: string, logger?: Logger) {
  const packageJson = await readPackage({ cwd: root });

  const vite = await createServer({
    root,
    configFile: false,
    logger,
    server: {
      middlewareMode: true,
      // It loads modules, never serves a page: no HMR port to collide on.
      hmr: false,
      watch: { ignored: ["**/.ph/**"] },
    },
    appType: "custom",
    // Its own cache, and no client deps to optimize: Studio's cache is the
    // project's node_modules/.vite, which it would otherwise rewrite.
    cacheDir: path.join(root, "node_modules", ".vite-reactor"),
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
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
