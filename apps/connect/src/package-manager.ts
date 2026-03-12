import type {
  IPackagesListener,
  VetraPackage,
} from "@powerhousedao/reactor-browser";
import {
  BrowserLocalStorage,
  COMMON_PACKAGE_ID,
  convertLegacyLibToVetraPackage,
  type IPackageListerUnsubscribe,
  type IPackageManager,
} from "@powerhousedao/reactor-browser";
import { type DocumentModelLib } from "document-model";
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
  #registryUrl: string | null;
  #storage: BrowserLocalStorage<PackageMeta>;
  #packages: Map<string, VetraPackage> = new Map();
  #subscribers = new Set<IPackagesListener>();
  #packagesMemo: VetraPackage[] = [];
  #stylesheets: Map<string, HTMLLinkElement> = new Map();

  constructor(namespace: string, registryUrl: string | null) {
    this.#storage = new BrowserLocalStorage<PackageMeta>(
      namespace + ":PH_PACKAGES",
    );
    this.#registryUrl = registryUrl;
  }

  async init(localPackage?: VetraPackage) {
    for (const packageName of this.#storage.keys()) {
      await this.addPackage(packageName);
    }
    const commonPackageWithMeta = this.#loadCommonPackage();
    this.#registerPackage(commonPackageWithMeta);
    if (localPackage) {
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

  async addPackage(packageName: string) {
    const packageWithMeta = await this.#loadPackage(packageName);
    if (!packageWithMeta) return;

    this.#registerPackage(packageWithMeta);
  }

  async addPackages(packageNames: string[]) {
    for (const packageName of packageNames) {
      await this.addPackage(packageName);
    }
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

  async #loadPackageFromNodeModules(
    name: string,
  ): Promise<PackageWithMeta | undefined> {
    if (name === COMMON_PACKAGE_NAME || name === LOCAL_PACKAGE_NAME) return;
    const importUrl = `/node_modules/${name}`;
    const stylesheetUrl = `${importUrl}/style.css`;

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
    if (this.#registryUrl === null) return;
    if (name === COMMON_PACKAGE_NAME || name === LOCAL_PACKAGE_NAME) return;

    const importUrl = `${this.#registryUrl}/${name}`;
    const stylesheetUrl = `${importUrl}/style.css`;
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

    if (!packageWithMeta && this.#registryUrl !== null) {
      packageWithMeta = await this.#loadPackageFromRegistry(packageName);
    }

    if (!packageWithMeta) {
      console.debug(
        `Failed to load package "${packageName}" from node_modules and package registry with url "${this.#registryUrl}".`,
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
    this.#storage.set(name, { name, importUrl, stylesheetUrl });

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
