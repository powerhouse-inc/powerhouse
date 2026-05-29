import { getConfig } from "@powerhousedao/config/node";
import type {
  Processor,
  ProcessorFactoryBuilder,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { childLogger, documentModelDocumentModelModule } from "document-model";
import EventEmitter from "node:events";
import type { StatWatcher } from "node:fs";
import { watchFile } from "node:fs";
import type {
  IPackageLoader,
  IPackageManager,
  IPackageManagerOptions,
  ISubscribablePackageLoader,
  PackageManagerResult,
} from "./types.js";
import { debounce } from "./util.js";

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
export function isExpectedLoaderMiss(error: unknown, pkg: string): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ERR_UNSUPPORTED_DIR_IMPORT") return true; // empty subgraphs/ etc.
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

export function getUniqueDocumentModels(
  ...documentModels: readonly (readonly DocumentModelModule<any>[])[]
): DocumentModelModule[] {
  const uniqueModels = new Map<string, DocumentModelModule>();

  for (const models of documentModels) {
    for (const model of models) {
      uniqueModels.set(model.documentModel.global.id, model);
    }
  }

  return Array.from(uniqueModels.values());
}

export class PackageManager implements IPackageManager {
  private readonly logger = childLogger(["reactor-api", "package-manager"]);
  private loaders: ISubscribablePackageLoader[];

  private docModelsMap = new Map<string, DocumentModelModule[]>();
  private subgraphsMap = new Map<string, SubgraphClass[]>();
  private processorMap = new Map<string, Processor>();
  private configWatcher: StatWatcher | undefined;
  private debouncedUpdateCallbacks = new Map<string, () => void>();
  private eventEmitter = new EventEmitter<{
    documentModelsChange: [Record<string, DocumentModelModule[]>];
    subgraphsChange: [Map<string, SubgraphClass[]>];
    processorsChange: [Map<string, Processor>];
  }>();

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

  private async loadPackages(
    packages: string[],
  ): Promise<PackageManagerResult> {
    this.logger.info("Loading packages: @packages", packages.join(", "));

    const documentModelsMap = await this.loadDocumentModels(packages);
    const subgraphsMap = await this.loadSubgraphs(packages);
    const processorsMap = await this.loadProcessors(packages);

    this.updatePackagesMap(documentModelsMap);
    this.updateSubgraphsMap(subgraphsMap);
    this.updateProcessorsMap(processorsMap);

    try {
      this.subscribePackages(packages);
    } catch (error) {
      this.logger.error("Failed to subscribe to packages: @error", error);
    }

    return {
      documentModels: getUniqueDocumentModels(
        ...Array.from(documentModelsMap.values()),
      ),
      subgraphs: subgraphsMap,
      processors: processorsMap,
    };
  }

  private async loadDocumentModels(
    packages: string[],
  ): Promise<Map<string, DocumentModelModule[]>> {
    this.logger.debug(
      `Loading document models from packages: ${packages.join(", ")}`,
    );

    const documentModelModuleMap = new Map<string, DocumentModelModule[]>();

    // static prereqs
    documentModelModuleMap.set("document-drive", [
      driveDocumentModelModule as unknown as DocumentModelModule,
    ]);

    documentModelModuleMap.set("document-model", [
      documentModelDocumentModelModule as unknown as DocumentModelModule,
    ]);

    documentModelModuleMap.set("reactor-drive", [
      reactorDriveDocumentModelModule as unknown as DocumentModelModule,
    ]);

    for (const pkg of packages) {
      const allDocumentModels: DocumentModelModule[] = [];
      const failures: { loader: string; error: unknown }[] = [];
      let succeeded = false;

      for (const loader of this.loaders) {
        try {
          const documentModels = await loader.loadDocumentModels(pkg);

          allDocumentModels.push(...documentModels);
          this.logger.info(
            `[${loader.name}] Loaded document models from package @pkg: @documentModels`,
            pkg,
            documentModels.map((dm) => dm.documentModel.global.id),
          );
          succeeded = true;
          break;
        } catch (error) {
          failures.push({ loader: loader.name, error });
          this.logger.debug(
            `[${loader.name}] Failed to load document models from package @pkg: @error`,
            pkg,
            error,
          );
        }
      }

      this.maybeWarnAllLoadersFailed(
        "document models",
        pkg,
        succeeded,
        failures,
      );

      documentModelModuleMap.set(pkg, allDocumentModels);
    }

    return documentModelModuleMap;
  }

  private async loadSubgraphs(
    packages: string[],
  ): Promise<Map<string, SubgraphClass[]>> {
    this.logger.debug(
      `Loading subgraphs from packages: ${packages.join(", ")}`,
    );

    const subgraphsMap = new Map<string, SubgraphClass[]>();

    for (const pkg of packages) {
      const allSubgraphs: SubgraphClass[] = [];
      const failures: { loader: string; error: unknown }[] = [];
      let succeeded = false;

      for (const loader of this.loaders) {
        try {
          const subgraphs = await loader.loadSubgraphs(pkg);

          allSubgraphs.push(...subgraphs);
          succeeded = true;
          break;
        } catch (error) {
          failures.push({ loader: loader.name, error });
          this.logger.debug(
            `[${loader.name}] Failed to load subgraphs from package ${pkg}`,
            error,
          );
        }
      }

      this.maybeWarnAllLoadersFailed("subgraphs", pkg, succeeded, failures);

      subgraphsMap.set(pkg, allSubgraphs);
    }

    return subgraphsMap;
  }

  private async loadProcessors(
    packages: string[],
  ): Promise<Map<string, Processor>> {
    this.logger.debug(
      `Loading processors from packages: ${packages.join(", ")}`,
    );

    const processorsMap = new Map<string, Processor>();

    for (const pkg of packages) {
      const allProcessors: ProcessorFactoryBuilder[] = [];
      const failures: { loader: string; error: unknown }[] = [];
      let succeeded = false;

      for (const loader of this.loaders) {
        try {
          const processors = await loader.loadProcessors(pkg);

          if (processors) {
            allProcessors.push(processors);
          }
          succeeded = true;
          break;
        } catch (error) {
          failures.push({ loader: loader.name, error });
          this.logger.debug(
            `[${loader.name}] Failed to load processors from package ${pkg}`,
            error,
          );
        }
      }

      this.maybeWarnAllLoadersFailed("processors", pkg, succeeded, failures);

      processorsMap.set(pkg, allProcessors);
    }
    this.updateProcessorsMap(processorsMap);

    return processorsMap;
  }

  private maybeWarnAllLoadersFailed(
    kind: "document models" | "subgraphs" | "processors",
    pkg: string,
    succeeded: boolean,
    failures: { loader: string; error: unknown }[],
  ): void {
    if (succeeded || failures.length === 0) return;
    // Each loader's "this package isn't mine" failure is expected fallthrough,
    // not a real error. Only surface a warning when at least one loader hit
    // something unexpected (e.g. a bundle evaluation error or registry 5xx),
    // and show only those non-expected failures — expected misses would just
    // mislead the reader about which loader actually broke.
    const realFailures = failures.filter(
      ({ error }) => !isExpectedLoaderMiss(error, pkg),
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

  private async updateDocumentModelsForPackage(pkg: string): Promise<void> {
    this.logger.debug(`Updating document models for package: ${pkg}`);
    const documentModels = await this.loadDocumentModels([pkg]);
    const documentModelsMap = new Map(this.docModelsMap);
    documentModelsMap.set(pkg, documentModels.get(pkg) ?? []);
    this.updatePackagesMap(documentModelsMap);
  }

  private subscribePackages(packages: string[]) {
    const unsubs: (() => void)[] = [];
    for (const pkg of packages) {
      if (!this.debouncedUpdateCallbacks.has(pkg)) {
        this.debouncedUpdateCallbacks.set(
          pkg,
          debounce(() => this.updateDocumentModelsForPackage(pkg), 1000),
        );
      }
      const debouncedCallback = this.debouncedUpdateCallbacks.get(pkg)!;

      for (const loader of this.loaders) {
        if (loader.onDocumentModelsChange) {
          const unsub = loader.onDocumentModelsChange(pkg, debouncedCallback);
          unsubs.push(unsub);
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
    const packageNames = this.options.packages ?? [];
    if (this.options.configFile) {
      packageNames.push(
        ...this.getPackageNamesFromConfigFile(this.options.configFile),
      );
    }
    return packageNames;
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
          if (curr.mtime === prev.mtime) {
            return;
          }

          void this.loadPackages(this.getAllPackageNames());
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

  onDocumentModelsChange(
    handler: (documentModels: Record<string, DocumentModelModule[]>) => void,
  ): void {
    this.eventEmitter.on("documentModelsChange", handler);
  }

  onSubgraphsChange(
    handler: (subgraphs: Map<string, SubgraphClass[]>) => void,
  ): void {
    this.eventEmitter.on("subgraphsChange", handler);
  }

  onProcessorsChange(
    handler: (processors: Map<string, Processor>) => void,
  ): void {
    this.eventEmitter.on("processorsChange", handler);
  }
}
