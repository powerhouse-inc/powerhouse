import { execSync } from "node:child_process";
export const installPackages = async (packages: string[]) => {
  for (const packageName of packages) {
    execSync(`ph install ${packageName}`);
  }
};

export const readManifest = () => {
  const manifest = execSync(`ph manifest`).toString();
  return manifest;
};

import { getConfig } from "@powerhousedao/config/powerhouse";
import { Subgraph } from "@powerhousedao/reactor-api";
import { DocumentModelModule } from "document-model";
import EventEmitter from "node:events";
import { existsSync, readFileSync, StatWatcher, watchFile } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

interface IPackagesManager {
  onDocumentModelsChange(
    handler: (documentModels: DocumentModelModule[]) => void,
  ): void;
}

type IPackagesManagerOptions = { packages: string[] };

export async function loadDependency(packageName: string, subPath = "") {
  const packagePath = require.resolve(packageName, {
    paths: [process.cwd()],
  });

  const packageDir = dirname(packagePath);
  const packageRootPath = join(packageDir, "../../");
  const packageJsonPath = join(packageRootPath, "package.json");

  if (!existsSync(packageJsonPath)) {
    throw new Error(`Could not find package.json for ${packageName}`);
  }

  // read exports map from package.json
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const exportsMap = packageJson.exports?.[subPath || "."];

  if (!exportsMap) {
    throw new Error(`No exports found for ${packageName}/${subPath}`);
  }

  // use the "import" field explicitly
  const esmPath = join(
    packageRootPath,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    exportsMap.import || exportsMap.default || exportsMap,
  );

  const module = (await import(esmPath)) as unknown;
  return module;
}

async function loadPackagesDocumentModels(packages: string[]) {
  const loadedPackages = new Map<string, DocumentModelModule[]>();
  for (const pkg of packages) {
    try {
      console.log("> Loading package:", pkg);
      const pkgModule = (await loadDependency(pkg, "./document-models")) as {
        [key: string]: DocumentModelModule;
      };
      if (pkgModule) {
        console.log(`  ➜  Loaded Document Models from: ${pkg}`);
        loadedPackages.set(pkg, Object.values(pkgModule));
      } else {
        console.warn(`  ➜  No Document Models found: ${pkg}`);
      }
    } catch (e) {
      console.error("Error loading Document Models from", pkg, e);
    }
  }
  return loadedPackages;
}

async function loadPackagesSubgraphs(packages: string[]) {
  const loadedPackages = new Map<string, (typeof Subgraph)[]>();
  for (const pkg of packages) {
    const pkgModule = (await loadDependency(
      pkg,
      "./subgraphs",
    )) as (typeof Subgraph)[];
    if (pkgModule) {
      console.log(`  ➜  Loaded Subgraphs from: ${pkg}`);
      loadedPackages.set(pkg, pkgModule);
    } else {
      console.warn(`  ➜  No Subgraphs found: ${pkg}`);
    }
  }
  return loadedPackages;
}

function getUniqueDocumentModels(
  ...documentModels: DocumentModelModule[][]
): DocumentModelModule[] {
  const uniqueModels = new Map<string, DocumentModelModule>();

  for (const models of documentModels) {
    for (const model of models) {
      uniqueModels.set(model.documentModel.id, model);
    }
  }

  return Array.from(uniqueModels.values());
}

function getUniqueSubgraphs(
  subgraphs: (typeof Subgraph)[][],
): (typeof Subgraph)[] {
  const uniqueSubgraphs = new Map<string, typeof Subgraph>();
  for (const subgraphss of subgraphs) {
    const keys = Object.keys(subgraphss);
    for (const key of keys) {
      uniqueSubgraphs.set(
        key,
        (
          subgraphss as unknown as Record<
            string,
            Record<string, typeof Subgraph>
          >
        )[key][key],
      );
    }
  }
  return Array.from(uniqueSubgraphs.values());
}

export class PackagesManager implements IPackagesManager {
  private docModelsMap = new Map<string, DocumentModelModule[]>();
  private subgraphsMap = new Map<string, (typeof Subgraph)[]>();
  private configWatcher: StatWatcher | undefined;
  private eventEmitter = new EventEmitter<{
    documentModelsChange: DocumentModelModule[][];
    subgraphsChange: (typeof Subgraph)[][];
  }>();

  constructor(
    protected options: IPackagesManagerOptions,
    protected onError?: (e: unknown) => void,
  ) {
    this.eventEmitter.setMaxListeners(0);
  }

  public async init() {
    return await this.loadPackages(this.options.packages);
  }

  private async loadPackages(packages: string[]) {
    // install packages
    const packagesMap = await loadPackagesDocumentModels(packages);
    const subgraphsMap = await loadPackagesSubgraphs(packages);
    this.updatePackagesMap(packagesMap);
    this.updateSubgraphsMap(subgraphsMap);

    return {
      documentModels: getUniqueDocumentModels(
        ...Array.from(packagesMap.values()),
      ),
      subgraphs: getUniqueSubgraphs(Array.from(subgraphsMap.values())),
    };
  }

  private loadFromConfigFile(configFile: string) {
    const config = getConfig(configFile);
    const packages = config.packages;

    return this.loadPackages(
      packages?.map((pkg) => pkg.packageName) ?? [],
    ).catch(this.onError);
  }

  private initConfigFile(configFile: string) {
    const result = this.loadFromConfigFile(configFile);

    if (!this.configWatcher) {
      this.configWatcher = watchFile(
        configFile,
        { interval: 100 },
        (curr, prev) => {
          if (curr.mtime === prev.mtime) {
            return;
          }
          void this.loadFromConfigFile(configFile).catch(this.onError);
        },
      );
    }

    return result;
  }

  private updatePackagesMap(packagesMap: Map<string, DocumentModelModule[]>) {
    const oldPackages = Array.from(this.docModelsMap.keys());
    const newPackages = Array.from(packagesMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        console.log("> Removed package:", pkg);
      });
    this.docModelsMap = packagesMap;
    const documentModels = getUniqueDocumentModels(
      ...Array.from(packagesMap.values()),
    );
    this.eventEmitter.emit("documentModelsChange", documentModels);
  }

  private updateSubgraphsMap(subgraphsMap: Map<string, (typeof Subgraph)[]>) {
    const oldPackages = Array.from(this.subgraphsMap.keys());
    const newPackages = Array.from(subgraphsMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        console.log("> Removed Subgraphs from:", pkg);
      });
    this.subgraphsMap = subgraphsMap;
    const subgraphs = getUniqueSubgraphs(Array.from(subgraphsMap.values()));
    this.eventEmitter.emit("subgraphsChange", subgraphs);
  }

  onDocumentModelsChange(
    handler: (documentModels: DocumentModelModule[]) => void,
  ): void {
    this.eventEmitter.on("documentModelsChange", handler);
  }
  onSubgraphsChange(handler: (subgraphs: (typeof Subgraph)[]) => void): void {
    this.eventEmitter.on("subgraphsChange", handler);
  }
}
