import type {
  IPackagesListener,
  PackageManagerInstallResult,
  VetraPackage,
} from "@powerhousedao/reactor-browser";
import {
  BrowserLocalStorage,
  COMMON_PACKAGE_ID,
  convertLegacyLibToVetraPackage,
  type IPackageListerUnsubscribe,
  type IPackageManager,
} from "@powerhousedao/reactor-browser";
import {
  type DocumentModelLib,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import * as vetraVetraPackage from "@powerhousedao/vetra";
import {
  loadDocumentModelDocumentModelModule,
  loadDriveDocumentModelModule,
} from "./store/document-model.js";
import {
  loadDocumentModelEditor,
  loadGenericDriveExplorerEditorModule,
} from "./store/editor.js";

type PackageMeta = {
  name: string;
  importUrl: string | null;
  stylesheetUrl: string | null;
};

type PackageWithMeta = PackageMeta & {
  loadedPackage: VetraPackage;
};

const LOCAL_PACKAGE_NAME = "Local" as const;
const COMMON_PACKAGE_NAME = "Common" as const;

export class BrowserPackageManager implements IPackageManager {
  registryUrl: string | null;
  #storage: BrowserLocalStorage<PackageMeta>;
  #packages: Map<string, VetraPackage> = new Map();
  #subscribers = new Set<IPackagesListener>();
  #packagesMemo: VetraPackage[] = [];
  #stylesheets: Map<string, HTMLLinkElement> = new Map();
  #localPackage: VetraPackage | undefined;

  #cdnUrl: string | null;

  constructor(namespace: string, registryUrl: string | null) {
    this.#storage = new BrowserLocalStorage<PackageMeta>(
      namespace + ":PH_PACKAGES",
    );
    this.registryUrl = registryUrl;
    this.#cdnUrl = registryUrl !== null ? this.#toCdnUrl(registryUrl) : null;
  }

  #toCdnUrl(baseUrl: string): string {
    if (baseUrl.includes("/-/cdn")) return baseUrl;
    const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    return `${base}/-/cdn`;
  }

  async init(localPackage?: VetraPackage) {
    for (const packageName of this.#storage.keys()) {
      await this.addPackage(packageName);
    }
    const commonPackageWithMeta = this.#loadCommonPackage();
    this.#registerPackage(commonPackageWithMeta);
    const vetraVetraPackageWithMeta = this.#loadVetraPackage();
    this.#registerPackage(vetraVetraPackageWithMeta);
    if (localPackage) {
      this.#localPackage = localPackage;
      this.#registerPackage({
        name: LOCAL_PACKAGE_NAME,
        stylesheetUrl: null,
        importUrl: null,
        loadedPackage: localPackage,
      });
    }
  }

  get packages() {
    return this.#packagesMemo;
  }

  getPackageSource(packageName: string) {
    // check vs the constant name we use for common packages
    if (
      packageName === COMMON_PACKAGE_NAME ||
      packageName === "@powerhousedao/vetra"
    )
      return "common";
    // check if the package has the same name as the local project
    if (packageName === this.#localPackage?.name) return "project";
    const packageMeta = this.#storage.get(packageName);
    // if meta does not exist the package is not installed
    if (!packageMeta) return null;
    // if imported from node_modules then the package is installed locally
    if (packageMeta.importUrl === `/node_modules/${packageName}`)
      return "local-install";
    // all other import urls point to a registry
    return "registry-install";
  }

  async addPackage(packageName: string) {
    const packageWithMeta = await this.#loadPackage(packageName);
    if (!packageWithMeta)
      return {
        type: "error" as const,
        error: new Error(
          "Failed to load package. See console debug for outputs.",
        ),
      };

    this.#registerPackage(packageWithMeta);

    return {
      type: "success" as const,
      package: packageWithMeta.loadedPackage,
    };
  }

  async addPackages(packageNames: string[]) {
    const results: PackageManagerInstallResult[] = [];
    for (const packageName of packageNames) {
      const result = await this.addPackage(packageName);
      results.push(result);
    }
    return results;
  }

  removePackage(name: string) {
    this.#packages.delete(name);
    this.#storage.delete(name);
    this.#unmountStylesheet(name);
    this.#notifyPackagesChanged();
  }

  subscribe(handler: IPackagesListener): IPackageListerUnsubscribe {
    this.#subscribers.add(handler);
    return () => {
      this.#subscribers.delete(handler);
    };
  }

  load(documentType: string): Promise<DocumentModelModule<any>> {
    const documentModelModule = Array.from(
      this.#packages
        .values()
        .flatMap((p) => p.modules.documentModelModules ?? []),
    ).find((m) => m.documentType === documentType);

    if (documentModelModule) return Promise.resolve(documentModelModule);
    return Promise.reject(new Error("Model not available"));
  }

  #loadCommonPackage(): PackageWithMeta {
    const documentModelDocumentModelModule =
      loadDocumentModelDocumentModelModule();
    const driveDocumentModelModule = loadDriveDocumentModelModule();
    const documentModelEditorModule = loadDocumentModelEditor();
    const genericDriveExplorerEditorModule =
      loadGenericDriveExplorerEditorModule();
    const name = COMMON_PACKAGE_NAME;
    const importUrl = null;
    const stylesheetUrl = null;
    const loadedPackage: VetraPackage = {
      id: COMMON_PACKAGE_ID,
      name,
      description: "Common",
      category: "Common",
      author: {
        name: "Powerhouse",
        website: "https://powerhousedao.com",
      },
      modules: {
        documentModelModules: [
          documentModelDocumentModelModule,
          driveDocumentModelModule,
        ],
        editorModules: [
          documentModelEditorModule,
          genericDriveExplorerEditorModule,
        ],
      },
      upgradeManifests: [],
    };
    return {
      name,
      importUrl,
      stylesheetUrl,
      loadedPackage,
    };
  }

  #loadVetraPackage(): PackageWithMeta {
    const name = vetraVetraPackage.manifest.name;
    const importUrl = null;
    const stylesheetUrl = null;
    const loadedPackage: VetraPackage = convertLegacyLibToVetraPackage(
      vetraVetraPackage as DocumentModelLib,
    );
    return {
      name,
      importUrl,
      stylesheetUrl,
      loadedPackage,
    };
  }

  async #loadPackageFromNodeModules(
    name: string,
  ): Promise<PackageWithMeta | undefined> {
    if (import.meta.env.PROD) return;

    if (name === COMMON_PACKAGE_NAME || name === LOCAL_PACKAGE_NAME) return;
    const importUrl = `/node_modules/${name}/index.js`;
    const stylesheetUrl = `/node_modules/${name}/style.css`;

    const packageWithMeta = await this.#importPackage({
      name,
      importUrl,
      stylesheetUrl,
    });

    return packageWithMeta;
  }

  async #loadPackageFromRegistry(
    name: string,
  ): Promise<PackageWithMeta | undefined> {
    if (this.registryUrl === null) return;
    if (name === COMMON_PACKAGE_NAME || name === LOCAL_PACKAGE_NAME) return;

    const importUrl = `${this.#cdnUrl}/${name}/index.js`;
    const stylesheetUrl = `${this.#cdnUrl}/${name}/style.css`;
    const packageWithMeta = await this.#importPackage({
      name,
      importUrl,
      stylesheetUrl,
    });

    return packageWithMeta;
  }

  async #importPackage(packageMeta: PackageMeta) {
    const { name, importUrl, stylesheetUrl } = packageMeta;
    if (importUrl === null) return;

    try {
      const importedPackage = (await import(importUrl)) as DocumentModelLib;
      const loadedPackage = convertLegacyLibToVetraPackage(importedPackage);

      return {
        name,
        loadedPackage,
        importUrl,
        stylesheetUrl,
      };
    } catch (error) {
      console.debug(`Could not import package:`);
      console.debug({
        error,
        name,
        importUrl,
        stylesheetUrl,
      });
      return undefined;
    }
  }

  async #loadPackage(packageName: string) {
    let packageWithMeta: PackageWithMeta | undefined;

    packageWithMeta = await this.#loadPackageFromNodeModules(packageName);

    if (!packageWithMeta && this.registryUrl !== null) {
      packageWithMeta = await this.#loadPackageFromRegistry(packageName);
    }

    if (!packageWithMeta) {
      console.debug(
        `Failed to load package "${packageName}" from node_modules and package registry with url "${this.registryUrl}".`,
      );
      return undefined;
    }

    return packageWithMeta;
  }

  #registerPackage(packageWithMeta: PackageWithMeta) {
    const { name, loadedPackage, importUrl, stylesheetUrl } = packageWithMeta;

    if (stylesheetUrl !== null) {
      this.#mountStylesheet(name, stylesheetUrl);
    }
    this.#packages.set(name, loadedPackage);
    this.#storage.set(name, {
      name,
      importUrl,
      stylesheetUrl,
    });

    this.#notifyPackagesChanged();
  }

  #mountStylesheet(name: string, href: string) {
    const existing = this.#stylesheets.get(name);

    if (existing) return existing;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);

    this.#stylesheets.set(name, link);
  }

  #unmountStylesheet(name: string): void {
    const link = this.#stylesheets.get(name);
    if (!link) return;

    link.remove();
    this.#stylesheets.delete(name);
  }

  #notifyPackagesChanged() {
    this.#packagesMemo = Array.from(this.#packages.values());
    const packages = this.packages;
    this.#subscribers.forEach((handler) => {
      handler({ packages });
    });
  }
}
