import * as common from "@powerhousedao/powerhouse-vetra-packages";
import type {
  IPackagesListener,
  PackageManagerInstallResult,
} from "@powerhousedao/reactor-browser";
import {
  BrowserLocalStorage,
  type IPackageListerUnsubscribe,
  type IPackageManager,
} from "@powerhousedao/reactor-browser";
import {
  type DocumentModelLib,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import * as vetra from "@powerhousedao/vetra";

type PackageMeta = {
  name: string;
  importUrl: string | null;
  stylesheetUrl: string | null;
};

type PackageWithMeta = PackageMeta & {
  loadedPackage: DocumentModelLib;
};

const LOCAL_PACKAGE_NAME = "Local" as const;
const COMMON_PACKAGE_NAME = "Common" as const;
const VETRA_PACKAGE_NAME = "@powerhousedao/vetra" as const;
const LOCAL_PACKAGES: string[] = [
  LOCAL_PACKAGE_NAME,
  COMMON_PACKAGE_NAME,
  VETRA_PACKAGE_NAME,
];

export class BrowserPackageManager implements IPackageManager {
  registryUrl: string | null;
  #storage: BrowserLocalStorage<PackageMeta>;
  #packages: Map<string, DocumentModelLib> = new Map();
  #subscribers = new Set<IPackagesListener>();
  #packagesMemo: DocumentModelLib[] = [];
  #stylesheets: Map<string, HTMLLinkElement> = new Map();
  #localPackage: DocumentModelLib | undefined;

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

  async init(localPackage?: DocumentModelLib) {
    const commonPackageWithMeta = this.#loadCommonPackage();
    this.#registerPackage(commonPackageWithMeta);
    const vetraPackageWithMeta = this.#loadVetraPackage();
    this.#registerPackage(vetraPackageWithMeta);
    if (localPackage) {
      this.updateLocalPackage(localPackage);
    }
    for (const packageName of this.#storage.keys()) {
      await this.addPackage(packageName);
    }
  }

  updateLocalPackage(pkg: DocumentModelLib) {
    console.debug("Updating local package:", pkg);
    this.#localPackage = pkg;
    this.#registerPackage({
      name: LOCAL_PACKAGE_NAME,
      stylesheetUrl: null,
      importUrl: null,
      loadedPackage: pkg,
    });
  }

  get packages() {
    return this.#packagesMemo;
  }

  get cdnUrl(): string | null {
    return this.#cdnUrl;
  }

  getPackageSource(packageName: string) {
    // check vs the constant name we use for common packages
    if (LOCAL_PACKAGES.includes(packageName)) {
      return "common";
    }
    // check if the package has the same name as the local project
    if (packageName === this.#localPackage?.manifest.name) return "project";
    const packageMeta = this.#storage.get(packageName);
    // if meta does not exist the package is not installed
    if (!packageMeta) return null;
    // if imported from node_modules then the package is installed locally
    if (packageMeta.importUrl === `/node_modules/${packageName}`)
      return "local-install";
    // all other import urls point to a registry
    return "registry-install";
  }

  async addPackage(packageName: string): Promise<PackageManagerInstallResult> {
    const existingPackage = this.#packages.get(packageName);
    if (existingPackage) {
      return {
        type: "success",
        package: existingPackage,
      };
    }
    try {
      const packageWithMeta = await this.#loadPackage(packageName);
      this.#registerPackage(packageWithMeta);

      return {
        type: "success",
        package: packageWithMeta.loadedPackage,
      };
    } catch (error) {
      return {
        type: "error",
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
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
      this.#packages.values().flatMap((p) => p.documentModels),
    ).find((m) => m.documentModel.global.id === documentType);

    if (documentModelModule) return Promise.resolve(documentModelModule);
    return Promise.reject(new Error("Model not available"));
  }

  #loadCommonPackage(): PackageWithMeta {
    return {
      name: common.manifest.name,
      importUrl: null,
      stylesheetUrl: null,
      loadedPackage: common,
    };
  }

  #loadVetraPackage(): PackageWithMeta {
    return {
      name: vetra.manifest.name,
      importUrl: null,
      stylesheetUrl: null,
      loadedPackage: vetra,
    };
  }

  async #loadPackageFromNodeModules(name: string): Promise<PackageWithMeta> {
    const importUrl = `/node_modules/${name}/browser/index.js`;
    const stylesheetUrl = `/node_modules/${name}/style.css`;

    const packageWithMeta = await this.#importPackage({
      name,
      importUrl,
      stylesheetUrl,
    });

    return packageWithMeta;
  }

  async #loadPackageFromRegistry(name: string): Promise<PackageWithMeta> {
    const importUrl = `${this.#cdnUrl}/${name}/browser/index.js`;
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
    if (!importUrl) {
      throw new Error(`Import url not defined for package "${name}".`);
    }

    const loadedPackage = (await import(
      /* @vite-ignore */ importUrl
    )) as DocumentModelLib;

    return {
      name,
      loadedPackage,
      importUrl,
      stylesheetUrl,
    };
  }

  async #loadPackage(packageName: string): Promise<PackageWithMeta> {
    if (LOCAL_PACKAGES.includes(packageName)) {
      throw new Error(
        `Package "${packageName}" is a local package and cannot be loaded dynamically.`,
      );
    }

    // only attemp to load from node_modules in dev mode
    if (!import.meta.env.PROD) {
      try {
        const packageWithMeta =
          await this.#loadPackageFromNodeModules(packageName);
        return packageWithMeta;
      } catch (error) {
        console.warn(
          `Failed to load package "${packageName}" from node_modules:`,
          error,
        );
      }
    }

    if (!this.registryUrl) {
      throw new Error("Registry url not defined.");
    }

    return await this.#loadPackageFromRegistry(packageName);
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
