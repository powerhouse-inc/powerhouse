import { getConfig } from "@powerhousedao/config/node";
import type {
  Processor,
  ProcessorFactoryBuilder,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type {
  DocumentModelModule,
  UpgradeManifest,
} from "@powerhousedao/shared/document-model";
import { childLogger } from "document-model";
import EventEmitter from "node:events";
import type { StatWatcher } from "node:fs";
import { watchFile } from "node:fs";
import type {
  IPackageLoader,
  IPackageManager,
  IPackageManagerOptions,
  ISubscribablePackageLoader,
  PackageManagerResult,
  PackagePieceEntry,
} from "./types.js";
import { baseDocumentModels } from "./base-document-models.js";
import {
  PACKAGE_MODULE_FAILED,
  debounce,
  manifestDeclaredSubgraphs,
} from "./util.js";
import { runDetached } from "../utils/detached.js";
import {
  REGISTRY_ENTRY_ABSENT,
  REGISTRY_EXTERNAL_DEPS_MISSING,
} from "./registry-cache.js";

/**
 * A loader throwing "this package isn't mine to load" is normal — loaders are
 * fallbacks for each other. These shapes mean "not found here", not "broken".
 *
 * `ERR_MODULE_NOT_FOUND` is ambiguous: it can mean either (a) the loader's own
 * entry import for `pkg` failed (expected — the package isn't installed
 * locally), or (b) the entry loaded successfully but a *transitive* bare
 * import inside it couldn't resolve (real error — the bundle is broken). We
 * distinguish by checking whether the error names the package we asked for —
 * either bare (`'pkg'`) or as a subpath (`'pkg/subgraphs'`), since loaders
 * import sub-entries like `${pkg}/subgraphs` / `${pkg}/document-models`.
 */
// `subPath` is the sub-entry that was asked for. With it, two more answers
// read as misses: an `exports` map that omits it, and a 404 for it.
export function isExpectedLoaderMiss(
  error: unknown,
  pkg: string,
  subPath?: string,
): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ERR_UNSUPPORTED_DIR_IMPORT") return true; // empty subgraphs/ etc.
  if (code === REGISTRY_ENTRY_ABSENT) return true;
  // An `exports` map without this subpath is the package saying it ships none
  // — the same answer as a missing directory, in a package that declares one.
  if (
    code === "ERR_PACKAGE_PATH_NOT_EXPORTED" &&
    subPath !== undefined &&
    error.message.includes(`'./${subPath}'`)
  ) {
    return true;
  }
  // Nothing published at that subpath; any other status is a registry fault,
  // and a 404 naming anything else is a broken bundle, not a miss.
  if (
    subPath !== undefined &&
    new RegExp(`^Failed to fetch \\S*/${subPath}/index\\.mjs: 404$`).test(
      error.message,
    )
  ) {
    return true;
  }
  // HttpPackageLoader rejects local paths and invalid npm names before any fetch
  if (error.message.startsWith("Invalid package name:")) return true;
  if (code === "ERR_MODULE_NOT_FOUND") {
    // Match `'pkg'`, `"pkg"`, `'pkg/...'`, or `"pkg/..."`. Anything else is a
    // transitive resolution failure inside a successfully-fetched bundle.
    return (
      error.message.includes(`'${pkg}'`) ||
      error.message.includes(`"${pkg}"`) ||
      error.message.includes(`'${pkg}/`) ||
      error.message.includes(`"${pkg}/`)
    );
  }
  return false;
}

const ALREADY_LOGGED = new Set([
  REGISTRY_EXTERNAL_DEPS_MISSING,
  PACKAGE_MODULE_FAILED,
]);

type PackageKind = "document models" | "subgraphs" | "processors" | "pieces";

// A failed load is kept apart from a package that ships none.
type PackageLoad<T> =
  | { status: "loaded"; value: T[] }
  | { status: "absent" }
  | { status: "failed" };

// The subpath every loader asked for, which tells "ships none" from "broken".
function subPathOf(kind: PackageKind): string {
  return kind === "document models" ? "document-models" : kind;
}

export function getUniqueDocumentModels(
  ...documentModels: readonly (readonly DocumentModelModule<any>[])[]
): DocumentModelModule[] {
  const uniqueModels = new Map<string, DocumentModelModule>();

  for (const models of documentModels) {
    for (const model of models) {
      // versions of a document type are distinct modules; keying by type
      // alone would keep only the last version of a versioned model
      uniqueModels.set(
        `${model.documentModel.global.id}@${model.version ?? 1}`,
        model,
      );
    }
  }

  return Array.from(uniqueModels.values());
}

export function getUniqueUpgradeManifests(
  ...upgradeManifests: readonly (readonly UpgradeManifest<
    readonly number[]
  >[])[]
): UpgradeManifest<readonly number[]>[] {
  const uniqueManifests = new Map<string, UpgradeManifest<readonly number[]>>();

  for (const manifests of upgradeManifests) {
    for (const manifest of manifests) {
      uniqueManifests.set(manifest.documentType, manifest);
    }
  }

  return Array.from(uniqueManifests.values());
}

export class PackageManager implements IPackageManager {
  private readonly logger = childLogger(["reactor-api", "package-manager"]);
  private loaders: ISubscribablePackageLoader[];

  private docModelsMap = new Map<string, DocumentModelModule[]>();
  private upgradeManifestsMap = new Map<
    string,
    UpgradeManifest<readonly number[]>[]
  >();
  private subgraphsMap = new Map<string, SubgraphClass[]>();
  private processorMap = new Map<string, Processor>();
  private piecesMap = new Map<string, PackagePieceEntry[]>();
  private configWatcher: StatWatcher | undefined;
  private unsubscribePackages: (() => void) | undefined;
  private subscribedPackages = new Set<string>();
  private removals = 0;
  private removedAt = new Map<string, number>();
  private loadQueue: Promise<unknown> = Promise.resolve();
  private removedPackages = new Set<string>();
  private debouncedUpdateCallbacks = new Map<string, () => void>();
  private eventEmitter = new EventEmitter<{
    documentModelsChange: [Record<string, DocumentModelModule[]>];
    subgraphsChange: [Map<string, SubgraphClass[]>];
    processorsChange: [Map<string, Processor>];
    piecesChange: [Map<string, PackagePieceEntry[]>];
  }>();

  private get detached() {
    return { logger: this.logger, report: this.options.reportError };
  }

  constructor(
    loaders: IPackageLoader[],
    protected options: IPackageManagerOptions,
  ) {
    this.loaders = loaders;
    this.eventEmitter.setMaxListeners(0);
  }

  public async init(): Promise<PackageManagerResult> {
    if (this.options.configFile) {
      this.initConfigFileWatcher(this.options.configFile);
    }

    return await this.loadPackages(this.getAllPackageNames());
  }

  // In call order, so a slower earlier load cannot overwrite a newer one.
  private loadPackages(packages: string[]): Promise<PackageManagerResult> {
    const requestedAt = this.removals;
    const load = this.loadQueue.then(() =>
      this.loadPackagesNow(packages, requestedAt),
    );
    this.loadQueue = load.catch(() => undefined);
    return load;
  }

  private async loadPackagesNow(
    requested: string[],
    requestedAt: number,
  ): Promise<PackageManagerResult> {
    this.logger.info("Loading packages: @packages", requested.join(", "));

    const documentModelLoads = await this.loadDocumentModels(requested);
    const failed = requested.filter(
      (pkg) => documentModelLoads.get(pkg)?.status === "failed",
    );
    const upgradeManifestsMap = await this.loadUpgradeManifests(
      requested.filter((pkg) => !failed.includes(pkg)),
    );
    for (const pkg of failed) {
      const manifests = this.upgradeManifestsMap.get(pkg);
      if (manifests) upgradeManifestsMap.set(pkg, manifests);
    }
    const documentModelsMap = new Map<string, DocumentModelModule[]>([
      ...baseDocumentModels.map(
        ([source, model]) =>
          [source, [model]] as [string, DocumentModelModule[]],
      ),
      ...this.settle("document models", documentModelLoads, this.docModelsMap),
    ]);
    const subgraphsMap = this.settle(
      "subgraphs",
      await this.loadSubgraphs(requested),
      this.subgraphsMap,
    );
    const processorsMap = this.settle(
      "processors",
      await this.loadProcessors(requested),
      this.processorMap,
    );
    const piecesMap = this.settle(
      "pieces",
      await this.loadPieces(requested),
      this.piecesMap,
    );

    const removed = requested.filter(
      (pkg) => (this.removedAt.get(pkg) ?? 0) > requestedAt,
    );
    for (const map of [
      documentModelsMap,
      upgradeManifestsMap,
      subgraphsMap,
      processorsMap,
      piecesMap,
    ]) {
      removed.forEach((pkg) => map.delete(pkg));
    }
    const packages = requested.filter((pkg) => !removed.includes(pkg));

    this.upgradeManifestsMap = upgradeManifestsMap;
    this.updatePackagesMap(documentModelsMap);
    this.updateSubgraphsMap(subgraphsMap);
    this.updateProcessorsMap(processorsMap);
    this.updatePiecesMap(piecesMap);

    this.unsubscribePackages?.();
    this.unsubscribePackages = undefined;
    this.subscribedPackages = new Set(packages);
    try {
      this.unsubscribePackages = this.subscribePackages(packages);
    } catch (error) {
      this.logger.error("Failed to subscribe to packages: @error", error);
    }

    return {
      documentModels: getUniqueDocumentModels(
        ...Array.from(documentModelsMap.values()),
      ),
      upgradeManifests: this.getUniqueUpgradeManifests(),
      subgraphs: subgraphsMap,
      processors: processorsMap,
      pieces: piecesMap,
    };
  }

  // A failed load is no news about a package: what it last provided stands.
  private settle<T>(
    kind: PackageKind,
    loads: Map<string, PackageLoad<T>>,
    current: Map<string, T[]>,
  ): Map<string, T[]> {
    const settled = new Map<string, T[]>();
    for (const [pkg, load] of loads) {
      if (load.status === "failed" && current.has(pkg)) {
        this.logger.info(`Keeping the last loaded ${kind} of @pkg`, pkg);
      }
      settled.set(
        pkg,
        load.status === "loaded"
          ? load.value
          : load.status === "failed"
            ? (current.get(pkg) ?? [])
            : [],
      );
    }
    return settled;
  }

  // The first loader to answer wins; only misses everywhere means absent.
  private async loadEach<T>(
    kind: PackageKind,
    packages: string[],
    load: (loader: ISubscribablePackageLoader, pkg: string) => Promise<T[]>,
  ): Promise<Map<string, PackageLoad<T>>> {
    this.logger.debug(`Loading ${kind} from packages: ${packages.join(", ")}`);
    const subPath = subPathOf(kind);
    const loads = new Map<string, PackageLoad<T>>();

    for (const pkg of packages) {
      const failures: { loader: string; error: unknown }[] = [];
      let loaded: PackageLoad<T> | undefined;

      for (const loader of this.loaders) {
        try {
          loaded = { status: "loaded", value: await load(loader, pkg) };
          break;
        } catch (error) {
          failures.push({ loader: loader.name, error });
          this.logger.debug(
            "[@loader] Failed to load @kind from package @package: @error",
            loader.name,
            kind,
            pkg,
            error,
          );
        }
      }

      this.maybeWarnAllLoadersFailed(kind, pkg, loaded !== undefined, failures);

      loads.set(
        pkg,
        loaded ??
          (failures.every(({ error }) =>
            isExpectedLoaderMiss(error, pkg, subPath),
          )
            ? { status: "absent" }
            : { status: "failed" }),
      );
    }

    return loads;
  }

  private loadDocumentModels(
    packages: string[],
  ): Promise<Map<string, PackageLoad<DocumentModelModule>>> {
    return this.loadEach("document models", packages, async (loader, pkg) => {
      const documentModels = await loader.loadDocumentModels(pkg);
      this.logger.info(
        `[${loader.name}] Loaded document models from package @pkg: @documentModels`,
        pkg,
        documentModels.map((dm) => dm.documentModel.global.id),
      );
      return documentModels;
    });
  }

  /** Upgrade manifests currently loaded across all packages, one per type. */
  public getUniqueUpgradeManifests(): UpgradeManifest<readonly number[]>[] {
    return getUniqueUpgradeManifests(
      ...Array.from(this.upgradeManifestsMap.values()),
    );
  }

  private async loadUpgradeManifests(
    packages: string[],
  ): Promise<Map<string, UpgradeManifest<readonly number[]>[]>> {
    const manifestsMap = new Map<
      string,
      UpgradeManifest<readonly number[]>[]
    >();

    for (const pkg of packages) {
      for (const loader of this.loaders) {
        if (!loader.loadUpgradeManifests) continue;
        try {
          const manifests = await loader.loadUpgradeManifests(pkg);
          if (manifests.length > 0) {
            manifestsMap.set(pkg, manifests);
            break;
          }
        } catch (error) {
          this.logger.debug(
            `[${loader.name}] Failed to load upgrade manifests from package @pkg: @error`,
            pkg,
            error,
          );
        }
      }
    }

    return manifestsMap;
  }

  private async loadSubgraphs(
    packages: string[],
  ): Promise<Map<string, PackageLoad<SubgraphClass>>> {
    const loads = await this.loadEach("subgraphs", packages, (loader, pkg) =>
      loader.loadSubgraphs(pkg),
    );

    // A bad export shape loads as none; only the manifest says some were meant.
    for (const [pkg, load] of loads) {
      if (load.status === "loaded" && load.value.length > 0) continue;
      const declared = manifestDeclaredSubgraphs(pkg);
      if (declared.length > 0) {
        this.logger.warn(
          "Package @pkg declares subgraphs in powerhouse.manifest.json (@declared) but none was loaded; check the exports of subgraphs/index.ts",
          pkg,
          declared.join(", "),
        );
      }
    }

    return loads;
  }

  private loadProcessors(
    packages: string[],
  ): Promise<Map<string, PackageLoad<ProcessorFactoryBuilder>>> {
    return this.loadEach("processors", packages, async (loader, pkg) => {
      const processors = await loader.loadProcessors(pkg);
      return processors ? [processors] : [];
    });
  }

  // Paths, not modules: a piece is code the host must not import, and what a
  // worker needs from here is where on disk the package put it.
  private async loadPieces(
    packages: string[],
  ): Promise<Map<string, PackageLoad<PackagePieceEntry>>> {
    const loads = await this.loadEach("pieces", packages, (loader, pkg) =>
      loader.loadPieces(pkg),
    );
    for (const [pkg, load] of loads) {
      if (load.status !== "loaded" || load.value.length === 0) continue;
      this.logger.info(
        "Loaded @count piece(s) from package @pkg: @pieces",
        load.value.length,
        pkg,
        load.value.map((piece) => piece.name).join(", "),
      );
    }
    return loads;
  }

  private maybeWarnAllLoadersFailed(
    kind: PackageKind,
    pkg: string,
    succeeded: boolean,
    failures: { loader: string; error: unknown }[],
  ): void {
    if (succeeded || failures.length === 0) return;
    const subPath = subPathOf(kind);
    // Each loader's "this package isn't mine" failure is expected fallthrough,
    // not a real error. Only surface a warning when at least one loader hit
    // something unexpected (e.g. a bundle evaluation error or registry 5xx),
    // and show only those non-expected failures — expected misses would just
    // mislead the reader about which loader actually broke.
    const realFailures = failures.filter(
      ({ error }) =>
        !isExpectedLoaderMiss(error, pkg, subPath) &&
        // The loader already logged why it skipped or failed the package.
        !ALREADY_LOGGED.has(
          (error as NodeJS.ErrnoException | undefined)?.code ?? "",
        ),
    );
    if (realFailures.length === 0) return;

    const details = realFailures
      .map(({ loader, error }) => {
        const message = error instanceof Error ? error.message : String(error);
        return `  [${loader}] ${message}`;
      })
      .join("\n");
    this.logger.warn(
      `All package loaders failed to load ${kind} from @pkg:\n@details`,
      pkg,
      details,
    );
  }

  // A failed reload changes nothing; an empty one drops the package.
  private withReload<T>(
    kind: PackageKind,
    current: Map<string, T[]>,
    pkg: string,
    load: PackageLoad<T> | undefined,
  ): Map<string, T[]> | undefined {
    if (load?.status === "failed") {
      if (current.has(pkg)) {
        this.logger.info(`Keeping the last loaded ${kind} of @pkg`, pkg);
      }
      return undefined;
    }
    const next = new Map(current);
    const value = load?.status === "loaded" ? load.value : [];
    if (value.length === 0) {
      next.delete(pkg);
    } else {
      next.set(pkg, value);
    }
    return next;
  }

  private async updateDocumentModelsForPackage(pkg: string): Promise<void> {
    this.logger.debug(`Updating document models for package: ${pkg}`);
    const load = (await this.loadDocumentModels([pkg])).get(pkg);
    const documentModelsMap = this.withReload(
      "document models",
      this.docModelsMap,
      pkg,
      load,
    );
    if (!documentModelsMap) return;
    const upgradeManifests = await this.loadUpgradeManifests([pkg]);
    if (!this.subscribedPackages.has(pkg)) return;
    const upgradeManifestsMap = new Map(this.upgradeManifestsMap);
    const pkgManifests = upgradeManifests.get(pkg) ?? [];
    if (pkgManifests.length === 0) {
      upgradeManifestsMap.delete(pkg);
    } else {
      upgradeManifestsMap.set(pkg, pkgManifests);
    }
    this.upgradeManifestsMap = upgradeManifestsMap;
    this.updatePackagesMap(documentModelsMap);
  }

  private async updateSubgraphsForPackage(pkg: string): Promise<void> {
    this.logger.debug(`Updating subgraphs for package: ${pkg}`);
    const load = (await this.loadSubgraphs([pkg])).get(pkg);
    if (!this.subscribedPackages.has(pkg)) return;
    const next = this.withReload("subgraphs", this.subgraphsMap, pkg, load);
    if (next) this.updateSubgraphsMap(next);
  }

  private async updateProcessorsForPackage(pkg: string): Promise<void> {
    this.logger.debug(`Updating processors for package: ${pkg}`);
    const load = (await this.loadProcessors([pkg])).get(pkg);
    if (!this.subscribedPackages.has(pkg)) return;
    const next = this.withReload("processors", this.processorMap, pkg, load);
    if (next) this.updateProcessorsMap(next);
  }

  private async updatePiecesForPackage(pkg: string): Promise<void> {
    this.logger.debug(`Updating pieces for package: ${pkg}`);
    const load = (await this.loadPieces([pkg])).get(pkg);
    if (!this.subscribedPackages.has(pkg)) return;
    const next = this.withReload("pieces", this.piecesMap, pkg, load);
    if (next) this.updatePiecesMap(next);
  }

  /** Debounced per key so repeated subscribePackages calls reuse one timer. */
  private getDebouncedUpdateCallback(
    pkg: string,
    kind: string,
    update: () => Promise<void>,
  ): () => void {
    const key = `${pkg}:${kind}`;
    if (!this.debouncedUpdateCallbacks.has(key)) {
      // A timer still pending for a package dropped since does nothing; the
      // update re-checks after its load for a drop while the load ran.
      const updateIfSubscribed = () =>
        this.subscribedPackages.has(pkg) ? update() : undefined;
      const debouncedFn = debounce(
        () => runDetached(`Updating ${key}`, updateIfSubscribed, this.detached),
        1000,
      );
      this.debouncedUpdateCallbacks.set(key, () => {
        void debouncedFn();
      });
    }
    return this.debouncedUpdateCallbacks.get(key)!;
  }

  private subscribePackages(packages: string[]) {
    const unsubs: (() => void)[] = [];
    for (const pkg of packages) {
      const onDocumentModels = this.getDebouncedUpdateCallback(
        pkg,
        "document-models",
        () => this.updateDocumentModelsForPackage(pkg),
      );
      const onSubgraphs = this.getDebouncedUpdateCallback(
        pkg,
        "subgraphs",
        () => this.updateSubgraphsForPackage(pkg),
      );
      const onProcessors = this.getDebouncedUpdateCallback(
        pkg,
        "processors",
        () => this.updateProcessorsForPackage(pkg),
      );
      const onPieces = this.getDebouncedUpdateCallback(pkg, "pieces", () =>
        this.updatePiecesForPackage(pkg),
      );

      for (const loader of this.loaders) {
        if (loader.onDocumentModelsChange) {
          unsubs.push(loader.onDocumentModelsChange(pkg, onDocumentModels));
        }
        if (loader.onSubgraphsChange) {
          unsubs.push(loader.onSubgraphsChange(pkg, onSubgraphs));
        }
        if (loader.onProcessorsChange) {
          unsubs.push(loader.onProcessorsChange(pkg, onProcessors));
        }
        if (loader.onPiecesChange) {
          unsubs.push(loader.onPiecesChange(pkg, onPieces));
        }
      }
    }

    return () => {
      for (const unsub of unsubs) {
        unsub();
      }
    };
  }

  private getAllPackageNames(): string[] {
    const packageNames = new Set(this.options.packages);
    if (this.options.configFile) {
      for (const name of this.getPackageNamesFromConfigFile(
        this.options.configFile,
      )) {
        packageNames.add(name);
      }
    }
    // Removed stays removed until nothing declares it, so declaring it again loads.
    for (const pkg of this.removedPackages) {
      if (!packageNames.has(pkg)) this.removedPackages.delete(pkg);
    }
    return Array.from(packageNames).filter(
      (pkg) => !this.removedPackages.has(pkg),
    );
  }

  private getPackageNamesFromConfigFile(configFile: string) {
    const loadedConfig = getConfig(configFile);
    return loadedConfig.packages?.map((pkg) => pkg.packageName) ?? [];
  }

  private initConfigFileWatcher(configFile: string) {
    if (!this.configWatcher) {
      this.configWatcher = watchFile(
        configFile,
        { interval: 100 },
        (curr, prev) => {
          if (curr.mtimeMs === prev.mtimeMs) {
            return;
          }

          void runDetached(
            "Reloading packages from the config file",
            () => this.loadPackages(this.getAllPackageNames()),
            this.detached,
          );
        },
      );
    }
  }

  private updatePackagesMap(packagesMap: Map<string, DocumentModelModule[]>) {
    const oldPackages = Array.from(this.docModelsMap.keys());
    const newPackages = Array.from(packagesMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        this.logger.info(`Removed package: ${pkg}`);
      });
    this.docModelsMap = packagesMap;
    this.eventEmitter.emit(
      "documentModelsChange",
      Object.fromEntries(packagesMap),
    );
  }

  private updateSubgraphsMap(subgraphsMap: Map<string, SubgraphClass[]>) {
    const oldPackages = Array.from(this.subgraphsMap.keys());
    const newPackages = Array.from(subgraphsMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        this.logger.info(`Removed Subgraphs from: ${pkg}`);
      });
    this.subgraphsMap = subgraphsMap;
    this.eventEmitter.emit("subgraphsChange", subgraphsMap);
  }

  private updateProcessorsMap(processorsMap: Map<string, Processor>) {
    const oldPackages = Array.from(this.processorMap.keys());
    const newPackages = Array.from(processorsMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        this.logger.info(`Removed Processor Factories from: ${pkg}`);
      });

    this.processorMap = processorsMap;
    this.eventEmitter.emit("processorsChange", processorsMap);
  }

  private updatePiecesMap(piecesMap: Map<string, PackagePieceEntry[]>) {
    const oldPackages = Array.from(this.piecesMap.keys());
    const newPackages = Array.from(piecesMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        this.logger.info("Removed pieces from: @pkg", pkg);
      });

    this.piecesMap = piecesMap;
    this.eventEmitter.emit("piecesChange", piecesMap);
  }

  /** The document models every loaded package ships, keyed by the package. */
  getDocumentModels(): Map<string, DocumentModelModule[]> {
    return new Map(this.docModelsMap);
  }

  /** The pieces every loaded package ships, keyed by the package. */
  getPieces(): Map<string, PackagePieceEntry[]> {
    return new Map(this.piecesMap);
  }

  hasPackage(pkg: string): boolean {
    return this.subscribedPackages.has(pkg);
  }

  /** Tear down everything `pkg` registered; config reloads leave it out. */
  removePackage(pkg: string): void {
    this.logger.info(`Removing package: ${pkg}`);
    this.subscribedPackages.delete(pkg);
    this.removedAt.set(pkg, ++this.removals);
    this.removedPackages.add(pkg);
    const dropKey = <T>(map: Map<string, T>): Map<string, T> => {
      if (!map.has(pkg)) return map;
      const next = new Map(map);
      next.delete(pkg);
      return next;
    };

    this.docModelsMap = dropKey(this.docModelsMap);
    this.upgradeManifestsMap = dropKey(this.upgradeManifestsMap);
    this.subgraphsMap = dropKey(this.subgraphsMap);
    this.processorMap = dropKey(this.processorMap);
    this.piecesMap = dropKey(this.piecesMap);

    this.updatePackagesMap(this.docModelsMap);
    this.updateSubgraphsMap(this.subgraphsMap);
    this.updateProcessorsMap(this.processorMap);
    this.updatePiecesMap(this.piecesMap);
  }

  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => unknown,
  ): void {
    this.eventEmitter.on("documentModelsChange", (documentModels) => {
      void runDetached(
        "Document models change listener",
        () => handler(documentModels),
        this.detached,
      );
    });
  }

  onSubgraphsChange(
    handler: (subgraphs: Map<string, SubgraphClass[]>) => unknown,
  ): void {
    this.eventEmitter.on("subgraphsChange", (subgraphs) => {
      void runDetached(
        "Subgraphs change listener",
        () => handler(subgraphs),
        this.detached,
      );
    });
  }

  onProcessorsChange(
    handler: (processors: Map<string, Processor>) => unknown,
  ): void {
    this.eventEmitter.on("processorsChange", (processors) => {
      void runDetached(
        "Processors change listener",
        () => handler(processors),
        this.detached,
      );
    });
  }

  onPiecesChange(
    handler: (pieces: Map<string, PackagePieceEntry[]>) => unknown,
  ): void {
    this.eventEmitter.on("piecesChange", (pieces) => {
      void runDetached(
        "Pieces change listener",
        () => handler(pieces),
        this.detached,
      );
    });
  }
}
