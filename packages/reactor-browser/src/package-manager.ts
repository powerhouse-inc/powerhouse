import type {
  IDocumentModelLoader,
  IDocumentModelRegistry,
} from "@powerhousedao/reactor";
import type { DocumentModelLib, DocumentModelModule } from "document-model";
import { RegistryClient } from "./registry/client.js";
import { BrowserLocalStorage } from "./storage/local-storage.js";
import type {
  IPackageListerUnsubscribe,
  IPackageManager,
  IPackagesListener,
  IPackagesMap,
  VetraPackage,
} from "./types/vetra.js";
import { convertLegacyLibToVetraPackage } from "./utils/vetra.js";

export interface PendingInstallation {
  documentType: string;
  packageName: string;
}

export interface DismissedPackage {
  packageName: string;
  documentTypes: string[];
}

export type PendingInstallationsListener = () => void;

interface DeferredAction {
  resolve: (module: DocumentModelModule<any>) => void;
  reject: (error: Error) => void;
}

const DISMISSED_STORAGE_KEY = "ph-connect-dismissed-packages";

function loadDismissedPackages(): DismissedPackage[] {
  try {
    const raw = localStorage.getItem(DISMISSED_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DismissedPackage[];
  } catch {
    // ignore
  }
  return [];
}

function persistDismissedPackages(dismissed: DismissedPackage[]): void {
  try {
    localStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(dismissed));
  } catch {
    // ignore
  }
}

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

// import function to prevent bundlers from breaking when parsing dynamic import
async function runtimeImport<T>(url: string) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call
  return new Function("u", "return import(u)")(url) as Promise<T>;
}

async function loadExternalPackage(name: string, registryUrl: string) {
  registryUrl = registryUrl.endsWith("/") ? registryUrl : `${registryUrl}/`;
  const url = `${registryUrl}${name}/index.js`;
  const module = await runtimeImport<DocumentModelLib>(url);
  loadCSS(name, registryUrl);
  return convertLegacyLibToVetraPackage(module);
}

export class BrowserPackageManager
  implements IPackageManager, IDocumentModelLoader
{
  #storage: BrowserLocalStorage<IPackagesMap>;
  #packages: Map<string, VetraPackage> = new Map();
  #localPackageIds = new Set<string>();
  #subscribers = new Set<IPackagesListener>();
  #packagesMemo: VetraPackage[] = [];

  // loader fields
  #registryCdnUrl?: string;
  #registryClient?: RegistryClient;
  #documentModelRegistry?: IDocumentModelRegistry;
  #pending: PendingInstallation[] = [];
  #dismissed: DismissedPackage[] = loadDismissedPackages();
  #deferredActions: Map<string, DeferredAction> = new Map();
  #pendingListeners = new Set<PendingInstallationsListener>();

  constructor(namespace: string, registryCdnUrl?: string) {
    this.#storage = new BrowserLocalStorage<IPackagesMap>(
      namespace + ":PH_PACKAGES",
    );
    const packages = this.#storage.get("packages");
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!packages) {
      this.#storage.set("packages", []);
    }

    if (registryCdnUrl) {
      this.#registryCdnUrl = registryCdnUrl;
      this.#registryClient = new RegistryClient(registryCdnUrl);
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

  // IDocumentModelLoader implementation

  setDocumentModelRegistry(registry: IDocumentModelRegistry): void {
    this.#documentModelRegistry = registry;
  }

  async load(documentType: string): Promise<DocumentModelModule<any>> {
    if (!this.#registryClient || !this.#registryCdnUrl) {
      throw new Error(
        "Registry CDN URL not configured — cannot discover packages",
      );
    }

    const packageNames =
      await this.#registryClient.getPackagesByDocumentType(documentType);

    if (packageNames.length === 0) {
      throw new Error(
        `No package found containing document type: ${documentType}`,
      );
    }

    const packageName = packageNames.sort((a, b) => a.localeCompare(b))[0];

    this.#pending = [...this.#pending, { documentType, packageName }];
    this.#notifyPendingListeners();

    return new Promise<DocumentModelModule<any>>((resolve, reject) => {
      this.#deferredActions.set(packageName, { resolve, reject });
    });
  }

  async approveInstallation(packageName: string): Promise<void> {
    const deferred = this.#deferredActions.get(packageName);
    if (!deferred) return;

    try {
      await this.addPackage(packageName, this.#registryCdnUrl!);
    } catch (error) {
      this.#removePending(packageName);
      this.#deferredActions.delete(packageName);
      deferred.reject(
        error instanceof Error
          ? error
          : new Error(`Failed to install package: ${packageName}`),
      );
      return;
    }

    const pendingEntries = this.#pending.filter(
      (p) => p.packageName === packageName,
    );

    this.#removePending(packageName);
    this.#deferredActions.delete(packageName);

    if (!this.#documentModelRegistry) {
      deferred.reject(new Error("Document model registry not available"));
      return;
    }

    for (const entry of pendingEntries) {
      try {
        const module = this.#documentModelRegistry.getModule(
          entry.documentType,
        );
        deferred.resolve(module);
        return;
      } catch {
        // module not found for this type, continue
      }
    }

    deferred.reject(
      new Error(`Module not found after installing package: ${packageName}`),
    );
  }

  rejectInstallation(packageName: string): void {
    const deferred = this.#deferredActions.get(packageName);
    if (!deferred) return;

    const rejectedEntries = this.#pending.filter(
      (p) => p.packageName === packageName,
    );
    const documentTypes = rejectedEntries.map((e) => e.documentType);

    this.#addDismissed(packageName, documentTypes);
    this.#removePending(packageName);
    this.#deferredActions.delete(packageName);
    deferred.reject(
      new Error(`Installation rejected for package: ${packageName}`),
    );
  }

  subscribePendingChanges(listener: PendingInstallationsListener): () => void {
    this.#pendingListeners.add(listener);
    return () => {
      this.#pendingListeners.delete(listener);
    };
  }

  getPendingInstallations(): PendingInstallation[] {
    return this.#pending;
  }

  getDismissedPackages(): DismissedPackage[] {
    return this.#dismissed;
  }

  removeDismissed(packageName: string): void {
    this.#dismissed = this.#dismissed.filter(
      (d) => d.packageName !== packageName,
    );
    persistDismissedPackages(this.#dismissed);
    this.#notifyPendingListeners();
  }

  #addDismissed(packageName: string, documentTypes: string[]): void {
    const existing = this.#dismissed.find((d) => d.packageName === packageName);
    if (existing) {
      const merged = new Set([...existing.documentTypes, ...documentTypes]);
      existing.documentTypes = [...merged];
    } else {
      this.#dismissed = [...this.#dismissed, { packageName, documentTypes }];
    }
    persistDismissedPackages(this.#dismissed);
  }

  #removePending(packageName: string): void {
    this.#pending = this.#pending.filter((p) => p.packageName !== packageName);
    this.#notifyPendingListeners();
  }

  #notifyPendingListeners(): void {
    for (const listener of this.#pendingListeners) {
      listener();
    }
  }
}
