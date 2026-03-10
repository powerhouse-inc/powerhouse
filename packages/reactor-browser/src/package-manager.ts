import type { DocumentModelLib } from "document-model";
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
  const url = `${registryUrl}${name}/index.js`;
  const module = await (import(
    /* @vite-ignore */ url
  ) as Promise<DocumentModelLib>);
  loadCSS(name, registryUrl);
  return convertLegacyLibToVetraPackage(module);
}

export class BrowserPackageManager implements IPackageManager {
  #storage: BrowserLocalStorage<IPackagesMap>;
  #packages: Map<string, VetraPackage> = new Map();
  #localPackageIds = new Set<string>();
  #subscribers = new Set<IPackagesListener>();
  #packagesMemo: VetraPackage[] = [];

  constructor(namespace: string) {
    this.#storage = new BrowserLocalStorage<IPackagesMap>(
      namespace + ":PH_PACKAGES",
    );
    const packages = this.#storage.get("packages");
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!packages) {
      this.#storage.set("packages", []);
    }
  }

  async init() {
    const packages = this.#storage.get("packages");
    for (const pkg of packages) {
      try {
        await this.addPackage(pkg.name, pkg.url);
      } catch {
        // ignore persisted packages that fail to load
      }
    }
  }

  get packages() {
    return this.#packagesMemo;
  }

  get localPackageIds(): Set<string> {
    return new Set(this.#localPackageIds);
  }

  async addPackage(name: string, registryUrl: string) {
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
    this.#notifyPackagesChanged();
  }

  async addLocalPackage(name: string, localPackage: VetraPackage) {
    this.#packages.set(name, localPackage);
    this.#localPackageIds.add(localPackage.id);
    this.#notifyPackagesChanged();
  }

  async removePackage(name: string) {
    this.#packages.delete(name);
    const storedPackages = this.#storage.get("packages");
    const packages = storedPackages.filter((pkg) => pkg.name !== name);
    this.#storage.set("packages", packages);
    removeCSS(name);
    this.#notifyPackagesChanged();
  }

  subscribe(handler: IPackagesListener): IPackageListerUnsubscribe {
    this.#subscribers.add(handler);
    return () => {
      this.#subscribers.delete(handler);
    };
  }

  #notifyPackagesChanged() {
    this.#packagesMemo = Array.from(this.#packages.values());
    const packages = this.packages;
    this.#subscribers.forEach((handler) => {
      handler({ packages });
    });
  }
}
