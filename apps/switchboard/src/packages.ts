import { getConfig } from "@powerhousedao/config/powerhouse";
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

type IPackagesManagerOptions = { packages: string[] } | { configFile: string };

async function loadDependency(packageName: string, subPath = "") {
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

  const module = (await import(esmPath)) as unknown as
    | { [key: string]: DocumentModelModule }
    | undefined;
  return module;
}

async function loadPackagesDocumentModels(packages: string[]) {
  const loadedPackages = new Map<string, DocumentModelModule[]>();
  for (const pkg of packages) {
    try {
      console.log("> Loading package:", pkg);
      const pkgModule = await loadDependency(pkg, "./document-models");
      if (pkgModule) {
        console.log(`  ➜  Loaded package: ${pkg}`);
        loadedPackages.set(pkg, Object.values(pkgModule));
      } else {
        console.warn(`  ➜  No package found: ${pkg}`);
      }
    } catch (e) {
      console.error("Error loading package", pkg, e);
    }
  }
  return loadedPackages;
}

function getUniqueDocumentModels(
  ...documentModels: DocumentModelModule[][]
): DocumentModelModule[] {
  const uniqueModels = new Map<string, DocumentModelModule>();

  // for (const models of documentModels) {
  //   for (const model of models) {
  //     uniqueModels.set(model.documentType, model);
  //   }
  // }

  return Array.from(uniqueModels.values());
}

export class PackagesManager implements IPackagesManager {
  private packagesMap = new Map<string, DocumentModelModule[]>();
  private configWatcher: StatWatcher | undefined;
  private eventEmitter = new EventEmitter<{
    documentModelsChange: DocumentModelModule[][];
  }>();

  constructor(
    protected options: IPackagesManagerOptions,
    protected onError?: (e: unknown) => void,
  ) {
    this.eventEmitter.setMaxListeners(0);

    if ("packages" in options) {
      void this.loadPackages(options.packages).catch(onError);
    } else if ("configFile" in options) {
      void this.initConfigFile(options.configFile).catch(onError);
    }
  }

  private async loadPackages(packages: string[]) {
    const packagesMap = await loadPackagesDocumentModels(packages);
    this.updatePackagesMap(packagesMap);
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
    const oldPackages = Array.from(this.packagesMap.keys());
    const newPackages = Array.from(packagesMap.keys());
    oldPackages
      .filter((pkg) => !newPackages.includes(pkg))
      .forEach((pkg) => {
        console.log("> Removed package:", pkg);
      });
    this.packagesMap = packagesMap;
    const documentModels = getUniqueDocumentModels(
      ...Array.from(packagesMap.values()),
    );
    this.eventEmitter.emit("documentModelsChange", documentModels);
  }

  onDocumentModelsChange(
    handler: (documentModels: DocumentModelModule[]) => void,
  ): void {
    this.eventEmitter.on("documentModelsChange", handler);
  }
}
