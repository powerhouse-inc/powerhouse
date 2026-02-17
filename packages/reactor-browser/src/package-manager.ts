import { childLogger, type ILogger } from "document-drive";
import type { DocumentModelLib } from "document-model";
import type { BaseStorage } from "./storage/base-storage.js";
import { BrowserLocalStorage } from "./storage/local-storage.js";
import type {
  IPackageListerUnsubscribe,
  IPackageManager,
  IPackagesListener,
  IPackagesMap,
  VetraPackage,
} from "./types/vetra.js";
import { convertLegacyLibToVetraPackage } from "./utils/vetra.js";

function loadCSS(pkg: string, registryUrl: string) {
  const head = document.getElementsByTagName("head")[0];
  const existingStyle = head.querySelector(`link[data-package='${pkg}']`);
  if (existingStyle) {
    return;
  }
  // Creating link element
  const style = document.createElement("link");
  style.href = registryUrl + pkg + "/style.css";
  style.type = "text/css";
  style.rel = "stylesheet";
  style.dataset.package = pkg;
  head.append(style);
}

function removeCSS(pkg: string) {
  const head = document.getElementsByTagName("head")[0];
  const style = head.querySelector(`link[data-package='${pkg}']`);
  if (style) {
    style.remove();
  }
}

async function loadExternalPackage(name: string, registryUrl: string) {
  registryUrl = registryUrl.endsWith("/") ? registryUrl : `${registryUrl}/`;
  // TODO: use version to load the correct package
  const module = await (import(
    /* @vite-ignore */ `${registryUrl}${name}`
  ) as Promise<DocumentModelLib>);
  loadCSS(name, registryUrl);
  return convertLegacyLibToVetraPackage(module);
}

function unloadExternalPackage(name: string) {
  removeCSS(name);
}

export class BrowserPackageManager implements IPackageManager {
  #storage: BaseStorage<IPackagesMap>;
  #packages: Map<string, VetraPackage> = new Map();
  #logger: ILogger;
  #subscribers = new Set<IPackagesListener>();
  #packagesMemo: VetraPackage[] = [];

  constructor(
    namespace: string,
    logger: ILogger = childLogger(["package-manager"]),
  ) {
    this.#storage = new BrowserLocalStorage<IPackagesMap>(
      namespace + ":PH_PACKAGES",
    );
    this.#logger = logger;
    const packages = this.#storage.get("packages");

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!packages) {
      this.#storage.set("packages", []);
      return;
    }
  }

  async init() {
    const packages = this.#storage.get("packages");

    for (const pkg of packages) {
      try {
        await this.addPackage(pkg.name, pkg.url);
      } catch {
        // ignore
      }
    }
  }

  get packages() {
    return this.#packagesMemo; // returns memoized value to integrate with react
  }

  async addPackage(name: string, registryUrl: string) {
    try {
      const module = await loadExternalPackage(name, registryUrl);
      this.#packages.set(name, module);
      const storedPackages = this.#storage.get("packages");
      const existingPackage = storedPackages.find((pkg) => pkg.name === name);
      if (!existingPackage) {
        storedPackages.push({ name, url: registryUrl });
        this.#storage.set("packages", storedPackages);
      } else if (existingPackage.url !== registryUrl) {
        existingPackage.url = registryUrl;
        this.#storage.set("packages", storedPackages);
      }

      this.#logger.debug(`Package ${name} loaded successfully`);
      this.#notifyPackagesChanged();
    } catch (error) {
      this.#logger.error(`Error loading package ${name}`, error);
      throw error;
    }
  }

  async addLocalPackage(name: string, localPackage: VetraPackage) {
    this.#packages.set(name, localPackage);
    this.#notifyPackagesChanged();
    return Promise.resolve();
  }

  removePackage(name: string) {
    this.#packages.delete(name);
    const storedPackages = this.#storage.get("packages");
    const packages = storedPackages.filter((pkg) => pkg.name !== name);
    this.#storage.set("packages", packages);
    unloadExternalPackage(name);
    this.#logger.debug(`Removed package ${name}`);
    this.#notifyPackagesChanged();
    return Promise.resolve();
  }

  subscribe(handler: IPackagesListener): IPackageListerUnsubscribe {
    this.#subscribers.add(handler);
    return () => {
      this.#subscribers.delete(handler);
    };
  }

  #notifyPackagesChanged() {
    const packages = this.packages;
    this.#packagesMemo = Array.from(this.#packages.values());
    this.#subscribers.forEach((handler) => {
      try {
        handler({ packages });
      } catch (error) {
        this.#logger.error("Error notifying packages subscriber", error);
      }
    });
  }
}
